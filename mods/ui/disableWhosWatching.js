import { configChangeEmitter, configRead } from '../config.js';

configChangeEmitter.addEventListener('configChange', (event) => {
    const { key, value } = event.detail;
    if (key === 'enableWhoIsWatchingMenu') {
        disableWhosWatching(value);
    }
});

let interval;

function disableWhosWatching(value) {
    const raw = localStorage['yt.leanback.default::recurring_actions'];
    if (!raw) return;
    let LeanbackRecurringActions;
    try {
        LeanbackRecurringActions = JSON.parse(raw);
    } catch (e) {
        return;
    }
    const shouldPermanentlyEnable = configRead('permanentlyEnableWhoIsWatchingMenu');
    const date = new Date();
    const data = LeanbackRecurringActions.data && LeanbackRecurringActions.data.data;
    if (!data) return;
    const startupAccountSelector = data["startup-screen-account-selector-with-guest"];
    const whosWatchingZeroAccounts = data.whos_watching_fullscreen_zero_accounts;
    const signedOutWelcomeBack = data["startup-screen-signed-out-welcome-back"];
    if (!value) {
        // Setting it after 7 days should be enough, as it'll get executed every time the app launches.
        date.setDate(date.getDate() + 7);
        if (startupAccountSelector) startupAccountSelector.lastFired = date.getTime();
        if (whosWatchingZeroAccounts) whosWatchingZeroAccounts.lastFired = date.getTime();
        if (signedOutWelcomeBack) signedOutWelcomeBack.lastFired = date.getTime();
        localStorage['yt.leanback.default::recurring_actions'] = JSON.stringify(LeanbackRecurringActions);
    } else {
        // Do nothing if the last fired action is less than 2 hours ago.
        const lastFired = startupAccountSelector && startupAccountSelector.lastFired;
        if (lastFired && date.getTime() - lastFired > 0 && date.getTime() - lastFired < 2 * 60 * 60 * 1000
        && !shouldPermanentlyEnable) {
            return;
        }
        function setActions() {
            if (startupAccountSelector) startupAccountSelector.lastFired = date.getTime();
            if (whosWatchingZeroAccounts) whosWatchingZeroAccounts.lastFired = date.getTime();
            if (signedOutWelcomeBack) signedOutWelcomeBack.lastFired = date.getTime();
            localStorage['yt.leanback.default::recurring_actions'] = JSON.stringify(LeanbackRecurringActions);
        }
        setActions();
        if (shouldPermanentlyEnable) {
            date.setDate(date.getDate() - 7);
            setActions();
            interval = setInterval(setActions, 60 * 1000);
        } else if (interval) clearInterval(interval);
    }
}

disableWhosWatching(configRead('enableWhoIsWatchingMenu'));