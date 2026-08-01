const YOUR_UA = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 4.0) AppleWebKit/537.3 (KHTML, like Gecko) SamsungBrowser/2.1 TV Safari/537.3';

function applyUserAgentOnce() {
  try {
    const applied = localStorage.getItem('userAgent');
    if (applied === YOUR_UA) return;

    localStorage.setItem('userAgent', YOUR_UA);

    if (
      typeof tizen !== 'undefined' &&
      tizen.websetting &&
      typeof tizen.websetting.setUserAgentString === 'function'
    ) {
      tizen.websetting.setUserAgentString(
        YOUR_UA,
        function () {
          try {
            if (tizen.application && tizen.application.getCurrentApplication) {
              tizen.application.getCurrentApplication().exit();
            }
          } catch (e) {}
        },
        function () {},
      );
      return;
    }

    if (
      window.h5vcc &&
      window.h5vcc.tizentube &&
      window.h5vcc.tizentube.SetUserAgent
    ) {
      window.h5vcc.tizentube.SetUserAgent(YOUR_UA);
      location.reload();
    }
  } catch (e) {}
}

applyUserAgentOnce();
