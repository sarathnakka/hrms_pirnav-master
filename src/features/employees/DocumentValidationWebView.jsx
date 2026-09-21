import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { File } from 'expo-file-system';
import { WebView } from 'react-native-webview';

const VALIDATION_TIMEOUT_MS = 90000;
const PREPARATION_TIMEOUT_MS = 90000;
const UNAVAILABLE_MESSAGE = 'The document validator could not be started. Please check your internet connection and try again.';

// Versions match the web HRMS packages/scripts. The browser performs all file analysis locally.
const VALIDATOR_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<script>
(function () {
  var post = function (value) { window.ReactNativeWebView.postMessage(JSON.stringify(value)); };
  var worker = null;
  var pdfjs = null;
  var faceModel = null;
  var busy = false;
  var lastRequestId = null;
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  function decodeBase64(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function readImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = reject;
      image.src = dataUrl;
    });
  }
  function readable(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').length >= 20;
  }
  async function readPdf(base64) {
    var documentHandle = await pdfjs.getDocument({ data: decodeBase64(base64) }).promise;
    try {
      var page = await documentHandle.getPage(1);
      var content = await page.getTextContent();
      var embeddedText = content.items.map(function (item) { return item.str || ''; }).join(' ');
      if (readable(embeddedText)) return { text: embeddedText, engine: 'pdfjs-text' };

      var viewport = page.getViewport({ scale: 2 });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      if (canvas.width * canvas.height > 12000000) throw new Error('PDF_PAGE_TOO_LARGE');
      try {
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
        var result = await worker.recognize(canvas);
        return { text: result.data.text || '', engine: 'pdfjs-canvas-tesseract' };
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    } finally {
      await documentHandle.destroy();
    }
  }
  async function analyze(message) {
    var mime = String(message.mimeType || '').toLowerCase();
    var isPdf = mime === 'application/pdf';
    var isImage = mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png';
    var isPhoto = /passport[- ]size photo/i.test(message.documentType || '');
    if (!isPdf && !isImage) return { status: 'error', message: 'Unsupported file type. Please select a PDF, JPG, JPEG, or PNG file.' };
    if (isPhoto) {
      if (!isImage) return { status: 'invalid', message: 'Passport-size Photo must be a JPG, JPEG, or PNG image.' };
      var image = await readImage('data:' + mime + ';base64,' + message.base64);
      var predictions = await faceModel.estimateFaces(image, false);
      var faces = predictions.filter(function (face) {
        var confidence = Array.isArray(face.probability) ? face.probability[0] : (face.probability || 1);
        return Number(confidence) >= 0.70;
      });
      var ratio = 0;
      if (faces.length === 1) {
        var face = faces[0];
        ratio = Math.abs(face.bottomRight[0] - face.topLeft[0]) *
          Math.abs(face.bottomRight[1] - face.topLeft[1]) / (image.width * image.height);
      }
      image.src = '';
      return { status: 'ok', faceCount: faces.length, faceRatio: ratio, engine: 'blazeface' };
    }
    var extraction;
    if (isPdf) {
      extraction = await readPdf(message.base64);
    } else {
      var result = await worker.recognize('data:' + mime + ';base64,' + message.base64);
      extraction = { text: result.data.text || '', engine: 'tesseract' };
    }
    if (!readable(extraction.text)) {
      return { status: 'unreadable', message: 'The document text could not be read clearly. Please upload or capture a clearer copy.' };
    }
    return { status: 'ok', text: extraction.text, engine: extraction.engine };
  }
  async function receive(event) {
    var message;
    try { message = JSON.parse(event.data); } catch (_) { return; }
    if (message.type !== 'VALIDATE_DOCUMENT') return;
    if (message.requestId === lastRequestId) return;
    lastRequestId = message.requestId;
    if (busy || !worker || !pdfjs || !faceModel) {
      post({ type: 'VALIDATION_RESULT', requestId: message.requestId, status: 'error', message: 'The document validator is not ready. Please try again.' });
      return;
    }
    busy = true;
    try {
      var result = await analyze(message);
      post(Object.assign({ type: 'VALIDATION_RESULT', requestId: message.requestId }, result));
    } catch (_) {
      post({ type: 'VALIDATION_RESULT', requestId: message.requestId, status: 'error', message: "We couldn't validate this document right now. Please try again." });
    } finally {
      message.base64 = null;
      busy = false;
    }
  }
  window.addEventListener('message', receive);
  document.addEventListener('message', receive);
  (async function () {
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js');
      pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs';
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.0.7/dist/blazeface.min.js');
      worker = await Tesseract.createWorker('eng', 1, {
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0/tesseract-core.wasm.js',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        logger: function () {},
      });
      faceModel = await blazeface.load();
      post({ type: 'VALIDATOR_READY' });
    } catch (_) {
      post({ type: 'VALIDATOR_ERROR', message: 'The document validator could not be started. Please check your internet connection and try again.' });
    }
  })();
})();
</script></body></html>`;

const DocumentValidationWebView = forwardRef(function DocumentValidationWebView(_, ref) {
  const webViewRef = useRef(null);
  const pendingRef = useRef(new Map());
  const readyWaitersRef = useRef([]);
  const readyRef = useRef(false);
  const failureRef = useRef(null);
  const counterRef = useRef(0);
  const [instance, setInstance] = useState(0);

  const fail = useCallback((message = UNAVAILABLE_MESSAGE) => {
    readyRef.current = false;
    failureRef.current = message;
    readyWaitersRef.current.splice(0).forEach(({ reject }) => reject(new Error(message)));
    pendingRef.current.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new Error(message));
    });
    pendingRef.current.clear();
  }, []);

  useEffect(() => () => fail(), [fail]);

  const waitUntilReady = useCallback(() => {
    if (readyRef.current) return Promise.resolve();
    if (failureRef.current) return Promise.reject(new Error(failureRef.current));
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      readyWaitersRef.current.push(waiter);
      const timer = setTimeout(() => {
        readyWaitersRef.current = readyWaitersRef.current.filter((item) => item !== waiter);
        reject(new Error('Validation took too long. Please try again.'));
      }, PREPARATION_TIMEOUT_MS);
      waiter.resolve = () => { clearTimeout(timer); resolve(); };
      waiter.reject = (error) => { clearTimeout(timer); reject(error); };
    });
  }, []);

  useImperativeHandle(ref, () => ({
    isReady: () => readyRef.current,
    retry: () => {
      fail();
      failureRef.current = null;
      setInstance((value) => value + 1);
    },
    analyze: async (file, documentType) => {
      await waitUntilReady();
      const requestId = String(++counterRef.current);
      const base64 = await new File(file.uri).base64();
      const providedMime = String(file.mimeType || file.type || '').toLowerCase();
      const mimeType = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(providedMime)
        ? providedMime
        : /\.pdf$/i.test(file.name || '') ? 'application/pdf'
          : /\.png$/i.test(file.name || '') ? 'image/png' : 'image/jpeg';
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRef.current.delete(requestId);
          reject(new Error('Validation took too long. Please try again.'));
        }, VALIDATION_TIMEOUT_MS);
        pendingRef.current.set(requestId, { resolve, reject, timer });
        webViewRef.current?.postMessage(JSON.stringify({
          type: 'VALIDATE_DOCUMENT', requestId, documentType, mimeType, base64,
        }));
      });
    },
  }), [fail, waitUntilReady]);

  const onMessage = useCallback((event) => {
    let message;
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (message.type === 'VALIDATOR_READY') {
      readyRef.current = true;
      failureRef.current = null;
      readyWaitersRef.current.splice(0).forEach(({ resolve }) => resolve());
    } else if (message.type === 'VALIDATOR_ERROR') {
      fail(message.message);
    } else if (message.type === 'VALIDATION_RESULT') {
      const pending = pendingRef.current.get(String(message.requestId));
      if (!pending) return;
      pendingRef.current.delete(String(message.requestId));
      clearTimeout(pending.timer);
      pending.resolve(message);
    }
  }, [fail]);

  return (
    <WebView
      key={instance}
      ref={webViewRef}
      source={{ html: VALIDATOR_HTML }}
      style={styles.hidden}
      originWhitelist={['*']}
      onMessage={onMessage}
      onError={() => fail()}
      onHttpError={() => fail()}
      onRenderProcessGone={() => fail()}
      javaScriptEnabled
      scrollEnabled={false}
    />
  );
});

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -1000, top: 0 },
});

export default DocumentValidationWebView;
