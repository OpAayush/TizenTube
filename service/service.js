const dial = require("@patrickkfkan/peer-dial");
const express = require('express');
const cors = require('cors');
const uuid = require('uuid');
const { webConfigPage } = require("./webConfigPage.js");
const app = express();

// Tizen APIs may throw if the service app is launched outside a Tizen device
// (e.g. while testing service.js with node on a desktop) or before the Tizen
// runtime is ready. Every tizen.* call is wrapped so a single failure never
// crashes the express/DIAL server and, in turn, the userscript that polls it.
function tizenGetCapability(capability) {
    try {
        return tizen.systeminfo.getCapability(capability);
    } catch (err) {
        console.warn("tizen.systeminfo.getCapability failed:", err.message);
        return "";
    }
}

function tizenGetPackageId() {
    try {
        return tizen.application.getAppInfo().packageId;
    } catch (err) {
        console.warn("tizen.application.getAppInfo failed:", err.message);
        return null;
    }
}

function tizenLaunchAppControl(appControl, appId) {
    try {
        tizen.application.launchAppControl(appControl, appId);
    } catch (err) {
        console.warn("tizen.application.launchAppControl failed:", err.message);
    }
}

const corsOptions = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json());

const PORT = 8085;

// Web config store: the Tizen service app runs in a separate app context from
// the YouTube app, so it cannot read the userscript's localStorage. Instead the
// userscript pushes its config here (POST /api/config/push) and polls for
// changes (GET /api/config). The web page edits go through POST /api/config and
// bump the revision, which the userscript applies live.
let storedConfig = {};
let configRevision = 0;

app.get("/", (req, res) => {
    res.type("html").send(webConfigPage);
});

app.get("/api/config", (req, res) => {
    res.json({ revision: configRevision, config: storedConfig });
});

app.post("/api/config", (req, res) => {
    const body = req.body;
    if (body && typeof body === "object") {
        storedConfig = body;
        configRevision += 1;
        res.json({ ok: true, revision: configRevision });
    } else {
        res.status(400).json({ ok: false, error: "Invalid config payload" });
    }
});

app.post("/api/config/push", (req, res) => {
    const body = req.body;
    if (body && typeof body === "object") {
        storedConfig = body;
    }
    res.json({ ok: true });
});

// Return JSON errors (e.g. malformed JSON body) instead of the HTML error page.
app.use((err, req, res, next) => {
    res.status(err.status || 400).json({ ok: false, error: err.message || "Bad request" });
});
const apps = {
    "YouTube": {
        name: "YouTube",
        state: "stopped",
        allowStop: true,
        pid: null,
        additionalData: {},
        launch(launchData) {
            const tbPackageId = tizenGetPackageId();
            if (!tbPackageId) return;
            tizenLaunchAppControl(
                new tizen.ApplicationControl(
                    "http://tizen.org/appcontrol/operation/view",
                    null,
                    null,
                    null,
                    [
                        new tizen.ApplicationControlData("module", [JSON.stringify(
                            {
                                moduleName: '@foxreis/tizentube',
                                moduleType: 'npm',
                                args: launchData
                            }
                        )])
                    ]
                ), `${tbPackageId}.TizenBrewStandalone`);
        }
    }
};

// Use a stable uuid derived from the TV's tizenid so phones that cache the
// device identity by DIAL uuid keep recognizing it across service restarts.
// (Random uuid.v4() each start makes casting unreliable for cached clients.)
const deviceUuid = (() => {
    try {
        const tizenid = tizen.systeminfo.getCapability('http://tizen.org/system/tizenid');
        if (tizenid) {
            return uuid.v5(tizenid, '4bcbc514-bdd6-4163-8215-316526fd1d9b');
        }
    } catch (err) {
        console.warn("Could not read tizenid for stable uuid:", err.message);
    }
    return uuid.v4();
})();

const modelName = tizenGetCapability('http://tizen.org/system/model_name');

const dialServer = new dial.Server({
    expressApp: app,
    port: PORT,
    prefix: "/dial",
    manufacturer: 'Reis Can',
    modelName: 'TizenBrew',
    friendlyName: modelName ? `TizenTube (${modelName})` : 'TizenTube',
    uuid: deviceUuid,
    delegate: {
        getApp(appName) {
            return apps[appName];
        },
        launchApp(appName, launchData, callback) {
            console.log(`Got request to launch ${appName} with launch data: ${launchData}`);
            const app = apps[appName];
            if (app) {
                const parsedData = launchData.split('&').reduce((acc, cur) => {
                    const parts = cur.split('=');
                    const key = parts[0];
                    const value = parts[1];
                
                    if (typeof value !== 'undefined') {
                        acc[key] = value;
                    } else {
                        acc[key] = '';
                    }
                
                    return acc;
                }, {});
                
                if (parsedData.yumi) {
                    app.additionalData = parsedData;
                    app.state = "running"
                    callback("");
                    return;
                }
                app.pid = "run";
                app.state = "starting";
                app.launch(launchData);
                app.state = "running";
            }
            callback(app.pid);
        },
        stopApp(appName, pid, callback) {
            console.log(`Got request to stop ${appName} with pid: ${pid}`);
            const app = apps[appName];
            if (app && app.pid === pid) {
                app.pid = null;
                app.state = "stopped";
                callback(true);
            } else {
                callback(false);
            }
        }
    }
});


setInterval(() => {
    try {
        tizen.application.getAppsContext((appsContext) => {
            const tbPackageId = tizenGetPackageId();
            if (!tbPackageId) return;
            const running = appsContext.find(app => app.appId === `${tbPackageId}.TizenBrewStandalone`);
            if (!running) {
                apps["YouTube"].state = "stopped";
                apps["YouTube"].pid = null;
                apps["YouTube"].additionalData = {};
            }
        });
    } catch (err) {
        console.warn("App context check failed:", err.message);
    }
}, 5000);

app.listen(PORT, () => {
    dialServer.start();
});