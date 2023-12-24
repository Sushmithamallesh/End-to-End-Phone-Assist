require('dotenv').config();

async function initializeTextToSpeechConnection(ws) {
    const model = 'eleven_monolingual_v1';
    const voiceId = 'XB0fDUnXU5powFXDhCwa';
    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=${model}&output_format=ulaw_8000`;
    const WebSocket = require("ws");

    const socket = new WebSocket(wsUrl);

    // 2. Initialize the connection by sending the BOS message
    socket.onopen = function (event) {
        const bosMessage = {
            "text": " ",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.8
            },
            "xi_api_key": process.env.ELEVEN_LABS_API_KEY, // replace with your API key
        };

        socket.send(JSON.stringify(bosMessage));

        // 3. Send the input text message ("Hello World")
        const textMessage = {
            "text": "Hello World . Can you tell me about my life",
            "try_trigger_generation": true,
        };

        socket.send(JSON.stringify(textMessage));

        // // 4. Send the EOS message with an empty string
        // const eosMessage = {
        //     "text": ""
        // };

        // socket.send(JSON.stringify(eosMessage));
    };

    // 5. Handle server responses
    socket.onmessage = function (event) {
        const response = JSON.parse(event.data);

        console.log("Server response:", response);

        if (response.audio) {
            // decode and handle the audio data (e.g., play it)
            // Raw mulaw/8000 audio in encoded in base64
            if (ws && ws.readyState === WebSocket.OPEN) {
                console.log("Sending audio data to the WebSocket");
                ws.send(JSON.stringify({ event: "media", media: { payload: response.audio }, streamSid: ws.streamSid }));
            }

            console.log("Received audio chunk");
        } else {
            console.log("No audio data in the response");
        }

        if (response.isFinal) {
            // the generation is complete

        }

        if (response.normalizedAlignment) {
            // use the alignment info if needed
        }
    };

    // Handle errors
    socket.onerror = function (error) {
        console.error(`WebSocket Error: ${error}`);
    };

    // Handle socket closing
    socket.onclose = function (event) {
        if (event.wasClean) {
            console.info(`Connection closed cleanly, code=${event.code}, reason=${event}`);
        } else {
            console.warn('Connection died');
        }
    };
    return socket
}

module.exports = initializeTextToSpeechConnection;