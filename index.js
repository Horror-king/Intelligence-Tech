const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const axios = require('axios');
const Fuse = require('fuse.js'); // For fuzzy matching

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

let aiMemory = {};

// Load learned prompts from file on startup
function loadMemory() {
    try {
        if (fs.existsSync('teach.txt')) {
            const data = fs.readFileSync('teach.txt', 'utf-8');
            aiMemory = JSON.parse(data);
            console.log('Memory loaded successfully:', aiMemory);
        } else {
            console.log('teach.txt file does not exist. Starting with empty memory.');
        }
    } catch (error) {
        console.error('Error loading AI memory:', error);
        aiMemory = {}; // Reset memory in case of error
    }
}

// Save learned prompts to file
function saveMemory() {
    try {
        fs.writeFileSync('teach.txt', JSON.stringify(aiMemory, null, 2));
        console.log('Memory saved successfully:', aiMemory);
    } catch (error) {
        console.error('Error saving AI memory:', error);
    }
}

// Detect if the prompt is related to images
function isImageRelated(prompt) {
    const keywords = ['image', 'images', 'picture', 'pictures', 'photo', 'photos'];
    return keywords.some(keyword => prompt.includes(keyword));
}

// Fuzzy search for similar prompts
function findSimilarPrompt(userPrompt) {
    const fuse = new Fuse(Object.keys(aiMemory), {
        includeScore: true,
        threshold: 0.4 // Adjust this to control fuzziness
    });
    const results = fuse.search(userPrompt);
    if (results.length > 0) {
        return results[0].item; // Return the closest match
    }
    return null;
}

// Initial load of AI memory
loadMemory();

let chatHistory = [];

// Serve the HTML file
app.use(express.static('public'));

// Handle AI queries
app.get('/ai', async (req, res) => {
    const userPrompt = req.query.prompt?.trim().toLowerCase();
    console.log('Received prompt:', userPrompt);

    if (userPrompt) {
        chatHistory.push({ prompt: userPrompt });

        // Check if the prompt is asking "Who created you?"
        if (userPrompt === 'who created you?') {
            const response = "I'm the one who created her. My name is Hassan.";
            chatHistory.push({ response });
            return res.json({ response });
        }

        // Check if the prompt is related to images
        if (isImageRelated(userPrompt)) {
            const query = userPrompt;
            try {
                const apiUrl = `https://pinterest-dev.onrender.com/pinterest?query=${encodeURIComponent(query)}`;
                const resApi = await axios.get(apiUrl);
                const imageUrls = resApi.data.data.slice(0, 10); // Limit to 10 images

                if (imageUrls.length > 0) {
                    const response = `Here are some images of ${query}: \n${imageUrls.join('\n')}`;
                    chatHistory.push({ response });
                    return res.json({ response });
                } else {
                    throw new Error('No images found');
                }
            } catch (error) {
                console.error('Error fetching images:', error.message || error);
                const response = `Error fetching images for ${query}: ${error.message}`;
                chatHistory.push({ response });
                return res.json({ response });
            }
        }

        // Fuzzy matching and memory search
        const similarPrompt = findSimilarPrompt(userPrompt);

        if (similarPrompt) {
            const response = aiMemory[similarPrompt];
            console.log('Found response:', response);
            chatHistory.push({ response });
            res.json({ response });
        } else {
            console.log('Response not found in memory for prompt:', userPrompt);

            // Query an external AI API if no response is found
            try {
                const apiResponse = await axios.get(`https://llama3-cv-shassan.onrender.com/llama3?prompt=${encodeURIComponent(userPrompt)}`);
                const externalResponse = apiResponse.data.response;

                if (apiResponse.status === 200 && externalResponse) {
                    aiMemory[userPrompt] = externalResponse;
                    console.log('Learned from external API:', userPrompt, '->', externalResponse);
                    chatHistory.push({ response: externalResponse });
                    res.json({ response: externalResponse });

                    // Save the updated memory after learning from the external API
                    saveMemory();
                } else {
                    throw new Error("Invalid response from external API");
                }
            } catch (error) {
                console.error('Error querying external API:', error.response?.data || error.message || error);
                const response = "404 Error ❗";
                chatHistory.push({ response });
                res.json({ response });
            }
        }
    } else {
        res.json({ response: "Please provide a prompt." });
    }
});

// Handle teaching new prompts
app.post('/teach', (req, res) => {
    let { prompt, response } = req.body;
    if (prompt && response) {
        const lowerCasePrompt = prompt.trim().toLowerCase();
        aiMemory[lowerCasePrompt] = response.trim();
        console.log('Learned:', lowerCasePrompt, '->', response);
        saveMemory(); // Save the updated AI memory to file
        res.json({ response: `Learned: "${prompt}" -> "${response}"` });
    } else {
        res.status(400).json({ response: "Invalid data format. Provide both 'prompt' and 'response'." });
    }
});

// Handle chat history retrieval
app.get('/history', (req, res) => {
    res.json({ response: chatHistory });
});

// Inspect the current AI memory
app.get('/inspectMemory', (req, res) => {
    res.json({ response: aiMemory });
});

// Start the server
app.listen(3000, () => {
    console.log('AI server is running on port 3000');
});
