const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const fs = require('fs/promises');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Multer writes uploads to disk so we can safely convert with base64 and cleanup.
const upload = multer({ dest: 'uploads/' });

app.use(express.static(path.join(__dirname, 'public')));

/**
 * Infer MIME type from common image extension.
 * Gemini needs an explicit MIME type for inline image data.
 */
function getMimeType(originalName) {
  const extension = path.extname(originalName).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
  };

  return mimeMap[extension] || 'image/jpeg';
}

/**
 * Convert uploaded file to base64 so we can send inlineData to Gemini.
 */
async function fileToBase64(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  return fileBuffer.toString('base64');
}

/**
 * Extract generated image data from Gemini response.
 */
function extractImageDataFromGemini(responseJson) {
  const candidates = responseJson?.candidates;
  if (!Array.isArray(candidates) || !candidates.length) {
    return null;
  }

  const parts = candidates[0]?.content?.parts || [];
  const inlineImagePart = parts.find((part) => part?.inlineData?.data);
  if (!inlineImagePart) {
    return null;
  }

  return {
    data: inlineImagePart.inlineData.data,
    mimeType: inlineImagePart.inlineData.mimeType || 'image/png'
  };
}

app.post(
  '/generate',
  upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'portrait', maxCount: 1 }
  ]),
  async (req, res) => {
    const thumbnail = req.files?.thumbnail?.[0];
    const portrait = req.files?.portrait?.[0];

    if (!thumbnail || !portrait) {
      return res.status(400).json({ error: 'Please upload both thumbnail and portrait images.' });
    }

    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_key_here') {
      return res
        .status(500)
        .json({ error: 'Gemini API key is missing. Set GEMINI_API_KEY in your .env file.' });
    }

    const userInstructions = (req.body.instructions || '').trim();
    const prompt = `Swap the face from the portrait image onto the person in the thumbnail image.
Make the result realistic with correct lighting, skin tone, and perspective.
Keep the original thumbnail context, composition, and quality.

Additional instructions from user:
${userInstructions || 'No extra instructions provided.'}`;

    try {
      const [thumbnailBase64, portraitBase64] = await Promise.all([
        fileToBase64(thumbnail.path),
        fileToBase64(portrait.path)
      ]);

      const body = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: getMimeType(thumbnail.originalname),
                  data: thumbnailBase64
                }
              },
              {
                inlineData: {
                  mimeType: getMimeType(portrait.originalname),
                  data: portraitBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE']
        }
      };

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${encodeURIComponent(
        GEMINI_API_KEY
      )}`;

      const geminiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const geminiJson = await geminiResponse.json();

      if (!geminiResponse.ok) {
        const details = geminiJson?.error?.message || 'Gemini API request failed.';
        return res.status(502).json({ error: details });
      }

      const generatedImage = extractImageDataFromGemini(geminiJson);
      if (!generatedImage) {
        return res.status(502).json({ error: 'Gemini returned no image. Try clearer images/instructions.' });
      }

      return res.json({
        imageBase64: generatedImage.data,
        mimeType: generatedImage.mimeType
      });
    } catch (error) {
      console.error('Generation error:', error);
      return res.status(500).json({ error: 'Failed to generate face swap image.' });
    } finally {
      // Best effort cleanup of temp uploads.
      await Promise.all([
        fs.unlink(thumbnail.path).catch(() => {}),
        fs.unlink(portrait.path).catch(() => {})
      ]);
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
