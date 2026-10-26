/* File handoff to the hosted mail form also works from local file:// editors. */
window.KeyringMail = (() => {
  const recipient = '10040mee@gmail.com';
  const maxBytes = 10 * 1024 * 1024;
  function open() {
    const url = location.protocol === 'file:'
      ? new URL('https://jiamom.github.io/3Dprint/tools/Send_3MF.html?v=mail-2')
      : new URL('Send_3MF.html?v=mail-2', location.href);
    let popup, timer, resolveReady, rejectReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    // Generation can fail before the ready promise is awaited.
    ready.catch(() => {});
    const listener = event => {
      if (event.source !== popup || event.origin !== url.origin || event.data?.type !== 'keyring-mail-ready') return;
      cleanup(); resolveReady();
    };
    const cleanup = () => { window.removeEventListener('message', listener); clearTimeout(timer); };
    window.addEventListener('message', listener);
    popup = window.open(url.href, '_blank');
    if (!popup) { cleanup(); rejectReady(Error('팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.')); throw Error('팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.'); }
    timer = setTimeout(() => { cleanup(); rejectReady(Error('메일 화면 연결 시간이 초과되었습니다. 다시 시도해 주세요.')); }, 30000);
    return {
      async send({ file, filename, title }) {
        if (!(file instanceof Blob) || !file.size || !/\.3mf$/i.test(filename)) throw Error('보낼 3MF 파일을 만들지 못했습니다.');
        if (file.size > maxBytes) throw Error('메일 첨부파일은 10MB 이하만 보낼 수 있습니다.');
        await ready;
        if (popup.closed) throw Error('메일 창이 닫혔습니다. 다시 눌러 주세요.');
        popup.postMessage({type:'keyring-mail-file',file,filename,title}, url.origin);
      },
      close() { cleanup(); rejectReady(Error('메일 전송이 취소되었습니다.')); if (!popup.closed) popup.close(); }
    };
  }
  function attach(button, generate, status, saveButton) {
    let busy = false;
    const sync = () => { button.disabled = busy || !!saveButton?.disabled; };
    if (saveButton) new MutationObserver(sync).observe(saveButton, {attributes:true,attributeFilter:['disabled']});
    sync();
    button.addEventListener('click', async () => {
      if (busy) return;
      let session;
      busy = true; sync();
      try {
        session = open();
        status.textContent = '메일에 첨부할 3MF 파일을 준비하고 있습니다…';
        const data = await generate();
        await session.send(data);
        status.textContent = '메일 전송 화면을 열었습니다. 새 창에서 전송 결과를 확인하세요. 처음에는 수신 메일의 활성화가 필요합니다.';
      } catch (error) {
        if (session) session.close();
        status.textContent = '메일 보내기 실패: ' + error.message;
      } finally { busy = false; sync(); }
    });
  }
  return { recipient, open, attach };
})();
