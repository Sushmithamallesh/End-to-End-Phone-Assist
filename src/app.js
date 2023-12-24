// Importing necessary libraries and modules
const express = require("express");
const WebSocket = require("ws");
const WaveFile = require("wavefile").WaveFile;
const twilio = require('twilio');
require('dotenv').config();
const initializeTextToSpeechConnection = require('./texttospeech');
const sendToPerplexity = require('./perplexity')
// Initializing Twilio client with account SID and auth token
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.AUTH_TOKEN);

// Initializing Express app and HTTP server for WebSocket
const app = express();
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });

// Variables to hold WebSocket connection and audio chunks
let assembly;
let chunks = [];
let last_mark = 0;
let elevenlabs;

function sendMediaToElevenLabs(text) {
  // Implementation for sending media to ElevenLabs will go here
  const textMessage = {
    "text": text,
    "try_trigger_generation": true,
  };

  elevenlabs.send(JSON.stringify(textMessage));
}
// WebSocket server event handling
wss.on("connection", (ws) => {
  console.info("New Connection Initiated");

  ws.on("message", async (message) => {
    // Check if the AssemblyAI WebSocket is initialized
    if (!assembly)
      return console.error("AssemblyAI's WebSocket must be initialized.");

    // Parse the incoming message
    const msg = JSON.parse(message);

    // Handle different message events
    switch (msg.event) {
      case "connected":
        console.info("Message: ", msg)
        // Ensure that the 'assembly' WebSocket is properly initialized and error handling is set up
        if (!assembly) {
          console.error("AssemblyAI's WebSocket is not open or has not been initialized.");
          break;
        }
        assembly.onerror = (error) => {
          console.error("WebSocket error:", error);
        };
        assembly.onmessage = (assemblyMsg) => {
          const texts = {};
          let msg = '';
          const res = JSON.parse(assemblyMsg.data);
          texts[res.audio_start] = res.text;
          const keys = Object.keys(texts).sort((a, b) => a - b);
          keys.forEach(key => {
            if (texts[key]) {
              msg += ` ${texts[key]}`;
            }
          });
          console.log(msg)
          // Check for sentence end or 30 seconds elapsed
          const sentenceEndRegex = /[.?!]\s*$/;
          if (sentenceEndRegex.test(msg.trim())) {
            console.log("sending to perplexity" + msg.trim())
            sendToPerplexity(msg.trim())
              .then(data => {
                // Handle the data
                console.log(data.choices[0].message.content)
                sendMediaToElevenLabs(data.choices[0].message.content)
              })
              .catch(error => {
                // Handle any errors
                console.error('An error occurred:', error);
              });
          } else {
            if (!this.perplexityTimeout && msg.trim() !== '') {
              this.perplexityTimeout = setTimeout(() => {
                console.log("sending to perplexity" + msg.trim())
                sendToPerplexity(msg.trim())
                  .then(data => {
                    // Handle the data
                    console.log(data.choices[0].message.content)
                    sendMediaToElevenLabs(data.choices[0].message.content)
                  })
                  .catch(error => {
                    // Handle any errors
                    console.error('An error occurred:', error);
                  });
                this.perplexityTimeout = null;
              }, 60000);
            }
          }
        };
        break;

      case "start":
        console.info("Starting media stream...");
        ws.streamSid = msg.streamSid;
        console.info(`A new call has started with Stream SID: ${ws.streamSid}`);
        break;

      case "media":
        const twilioData = msg.media.payload;
        let wav = new WaveFile();
        wav.fromScratch(1, 8000, "8m", Buffer.from(twilioData, "base64"));
        wav.fromMuLaw();
        const twilio64Encoded = wav.toDataURI().split("base64,")[1];
        const twilioAudioBuffer = Buffer.from(twilio64Encoded, "base64");
        chunks.push(twilioAudioBuffer.slice(44));
        if (chunks.length >= 5) {
          const audioBuffer = Buffer.concat(chunks);
          const encodedAudio = audioBuffer.toString("base64");
          if (assembly.readyState === WebSocket.OPEN) {
            assembly.send(JSON.stringify({ audio_data: encodedAudio }));
            if (!elevenlabs) {
              elevenlabs = await initializeTextToSpeechConnection(ws);
            }
          }
          if (last_mark !== msg.media.chunk) {
            ws.send(JSON.stringify({ event: "marked", start_chunk: last_mark, end_chunk: msg.media.chunk }));
            last_mark = msg.media.chunk;
          }
          chunks = []; // Reset chunks after sending
        }
        break;

      case "stop":
        console.info("Call has ended");
        assembly.send(JSON.stringify({ terminate_session: true }));
        break;
    }
  });

  ws.on("close", () => {
    console.info("Connection Closed");
    if (assembly) {
      assembly.close();
      assembly = null;
    }
    // 4. Send the EOS message with an empty string
    const eosMessage = {
      "text": ""
    };

    elevenlabs.send(JSON.stringify(eosMessage));
  });
});

// Express route handlers for GET and POST requests
app.post("/test", async (req, res) => {
  try {
    assembly = new WebSocket(
      "wss://api.assemblyai.com/v2/realtime/ws?sample_rate=8000&language=hi-IN",
      { headers: { authorization: process.env.ASSEMBLY_AI_KEY } }
    );
    res.set("Content-Type", "text/xml");
    res.send(
      `<Response>
         <Say language="en-US">
           Start speaking 
         </Say>
         <Connect>
           <Stream url='wss://${req.headers.host}' />
         </Connect>
         <Pause length='60' />
       </Response>`
    );
  } catch (error) {
    console.error('Error establishing WebSocket connection:', error);
    res.status(500).send('Failed to establish WebSocket connection');
  }
});

// Log the server listening port
console.log("Listening on Port 8080");

try {
  // Create a Twilio call with the specified URL, to and from numbers
  client.calls.create({
    url: 'https://6c48-2401-4900-1f28-663c-9f6-58a3-8cd-a83f.ngrok-free.app/test',
    to: "+918050204843",
    from: "+17606216268",
  });
} catch (error) {
  console.error('Error creating Twilio call:', error);
}
// Start the server and listen on the specified port
server.listen(8080);

process.on('exit', (code) => {
  console.log(`About to exit with code: ${code}`);
  if (assembly) {
    assembly.close();
    assembly = null;
  }
});