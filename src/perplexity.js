require('dotenv').config();

const sendToPerplexity = (text) => {
    const sdk = require('api')('@pplx/v0#b2wdhb1klq5dn1d6');
    sdk.auth(process.env.PERPLEXITY_API_KEY);
    // Return the Promise from the sdk.post_chat_completions call
    return sdk.post_chat_completions({
        model: 'mistral-7b-instruct',
        messages: [
            { role: 'system', content: 'Be precise and concise.' },
            { role: 'user', content: text }
        ],
    })
        .then(({ data }) => {
            return data; // Resolve the Promise with the data
        })
        .catch(err => {
            console.error(err);
            throw err; // Re-throw the error to be handled by the caller
        });
};

module.exports = sendToPerplexity;
