// This file must be saved in a folder named 'api' in the root of your project
// (e.g., project_root/api/design-generator.js)

// You will need to install 'node-fetch' if you are using a version of Node.js 
// that doesn't include it (though modern Vercel environments usually support it).

export default async function handler(request, response) {
    // 1. Check for POST method
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Retrieve API Key from Vercel Environment Variables
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        // This means you forgot to set the environment variable in Vercel settings!
        return response.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is missing.' });
    }

    // 3. Extract data from the frontend request
    const { prompt, image } = request.body;

    if (!prompt && !image) {
        return response.status(400).json({ error: 'Missing prompt or image data.' });
    }

    let model, apiUrlPath, payload;
    let isMultimodal = !!image;

    // 4. Configure the Google API call based on input
    if (isMultimodal) {
        // Multimodal: Image-to-Image / Modification
        model = 'gemini-2.5-flash-image-preview';
        apiUrlPath = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const parts = [];
        if (prompt) {
            parts.push({ text: prompt });
        } else {
            parts.push({ text: "Generate a high-resolution, unique t-shirt design based on the content and style of this image." });
        }
        
        parts.push({
            inlineData: {
                mimeType: image.mimeType,
                data: image.base64Data
            }
        });

        payload = {
            contents: [{ parts: parts }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE']
            },
        };

    } else {
        // Text-Only: Standard Text-to-Image Generation
        model = 'imagen-3.0-generate-002';
        apiUrlPath = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;

        payload = {
            instances: { prompt: prompt },
            parameters: { "sampleCount": 1 }
        };
    }

    // 5. Call the Google API
    try {
        const geminiResponse = await fetch(apiUrlPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // Handle direct Google API errors (like 403 Forbidden due to billing)
        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json();
            console.error('Google API Error:', errorData);

            // This is where billing/quota errors usually surface
            if (geminiResponse.status === 403 || geminiResponse.status === 400) {
                 return response.status(geminiResponse.status).json({
                    error: "Google API Rejected Request. Check that your Google Cloud Project has **Billing Enabled** and the Gemini API is active.",
                    details: errorData.error ? errorData.error.message : 'Unknown rejection reason.'
                });
            }
            
            throw new Error(`Google API request failed with status: ${geminiResponse.status}`);
        }

        const result = await geminiResponse.json();
        let base64Data = null;

        // 6. Extract the image data
        if (isMultimodal) {
            base64Data = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        } else {
            if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
                base64Data = result.predictions[0].bytesBase64Encoded;
            }
        }
        
        if (!base64Data) {
             return response.status(500).json({ error: 'Image data not found in API response.' });
        }

        // 7. Send the Base64 data back to the frontend
        response.status(200).json({ base64Data });

    } catch (error) {
        console.error('Serverless Function Execution Error:', error);
        response.status(500).json({ error: 'Internal server error during image generation.' });
    }
}
