const button = document.getElementById('capture');
const status = document.getElementById('status');

button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/(?:chatgpt\.com|chat\.openai\.com)(?:\/|$)/.test(tab.url ?? '')) {
      throw new Error('Open a ChatGPT conversation in the current tab.');
    }
    const target = { tabId: tab.id };
    await chrome.scripting.executeScript({ target, files: ['capture.js'] });
    const [{ result }] = await chrome.scripting.executeScript({
      target,
      func: () => globalThis.ADFPageCapture.captureAndDownload(),
    });
    if (result.error) throw new Error(result.error);
    status.textContent = `Saved ${result.turns} turns${result.warnings ? ' with import notes' : ''}.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
