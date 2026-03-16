const form = document.getElementById('faceSwapForm');
const statusSection = document.getElementById('statusSection');
const resultSection = document.getElementById('resultSection');
const resultImage = document.getElementById('resultImage');
const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('downloadBtn');

function setStatus(message, loading = false) {
  statusSection.textContent = message;
  statusSection.classList.toggle('loading', loading);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const thumbnailFile = formData.get('thumbnail');
  const portraitFile = formData.get('portrait');

  if (!thumbnailFile || thumbnailFile.size === 0 || !portraitFile || portraitFile.size === 0) {
    setStatus('Please upload both images before generating.');
    return;
  }

  generateBtn.disabled = true;
  resultSection.classList.remove('has-image');
  resultImage.removeAttribute('src');
  setStatus('Generating your face swap image...', true);

  try {
    const response = await fetch('/generate', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to generate image.');
    }

    const dataUri = `data:${data.mimeType};base64,${data.imageBase64}`;
    resultImage.src = dataUri;
    downloadBtn.href = dataUri;

    resultSection.classList.add('has-image');
    setStatus('Face swap generated successfully.');
  } catch (error) {
    setStatus(error.message || 'Something went wrong while generating the image.');
  } finally {
    statusSection.classList.remove('loading');
    generateBtn.disabled = false;
  }
});
