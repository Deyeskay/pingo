let isHost = location.hash === "#host";
let manualExit = false;
const peer = new Peer({ host: '0.peerjs.com', port: 443, path: '/' });
let conn;
let connections = [];
let nicknames = {};
let nickname = localStorage.getItem('nickname') || "";
const storedRole = localStorage.getItem('role');
if (storedRole) isHost = storedRole === 'host';
let currentHostId = "";

// ✅ Autofill join ID from ?join=... parameter
const params = new URLSearchParams(window.location.search);
const prefillJoinId = params.get("join");
if (prefillJoinId) {
  isHost = false; // force joiner mode
  localStorage.setItem('role', 'joiner'); // persist joiner role

  window.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("peer-id-input");
    if (input) input.value = prefillJoinId;
  });
}

peer.on('open', id => {
  document.getElementById("my-id").textContent = id;
  if (isHost && nickname) {
    nicknames[id] = nickname;
  }
  updateModeUI();
  updateParticipantDisplay();
  setupNicknameField();
});

peer.on('connection', c => {
  if (!isHost) return;
  connections.push(c);
  c.on('data', msg => {
    if (typeof msg === 'string' && msg.startsWith("nick:")) {
      const nick = msg.split("nick:")[1].trim();
      nicknames[c.peer] = nick;
      broadcastParticipantList();
      updateParticipantDisplay();

      // ✅ Broadcast join message
      if (nick) {
        log(`✅ ${nick} joined the room`, { color: "#0a0" });
        connections.forEach(conn => conn.send(JSON.stringify({
          type: "log",
          message: `✅ ${nick} joined the room`,
          color: "#0a0"
        })));
      }

    } else {
      // Broadcast to others
      connections.forEach(conn => {
        if (conn.peer !== c.peer) conn.send(msg);
      });
      log(typeof msg === 'string' ? msg : msg.message || "");
    }
  });

  c.on('close', () => {
    const name = nicknames[c.peer];
    connections = connections.filter(x => x !== c);
    delete nicknames[c.peer];
    broadcastParticipantList();
    updateParticipantDisplay();

    if (name) {
      log(`⚠️ ${name} left the room`, { color: "#d00" });
      connections.forEach(conn => conn.send(JSON.stringify({
        type: "log",
        message: `⚠️ ${name} left the room`,
        color: "#d00"
      })));
    }
  });
});

function connectToHost() {
  nickname = nickname || document.getElementById("nickname").value.trim();
  const hostId = document.getElementById("peer-id-input").value.trim();
  if (!nickname) return alert("Please enter your name.");
  if (!hostId) return alert("Please enter a Host ID.");

  localStorage.setItem('nickname', nickname);
  localStorage.setItem('role', 'joiner');

  const shouldClearChat = currentHostId !== hostId;
  currentHostId = hostId;

  conn = peer.connect(hostId);
  conn.on('open', () => {
    conn.send("nick:" + nickname);
    switchScreen(true);
    if (shouldClearChat) clearChat();
    log(`✅ Connected to host ${hostId} (5)`, { countdownSecs: 5 });

    conn.on('data', msg => {
      if (typeof msg === 'string' && msg.startsWith("list:")) {
        const names = msg.split("list:")[1].split(",");
        updateParticipantDisplay(names.map(name => name.trim()));
      } else {
        try {
          const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg;
          if (parsed.type === "log") {
            log(parsed.message, { color: parsed.color });
          } else {
            log(parsed.message || msg);
          }
        } catch {
          log(msg);
        }
      }
    });
  });

  conn.on('close', () => {
    if (!isHost && !manualExit) {
      log("⚠️ Host disconnected", { color: "red" });
    }
    manualExit = false;
  });
}

function broadcastParticipantList() {
  const allNames = Object.values(nicknames);
  connections.forEach(c => c.send("list:" + allNames.join(",")));
}

function updateParticipantDisplay(overwriteList = null) {
  const list = overwriteList || Object.values(nicknames);
  const count = list.length;
  const ul = document.getElementById("people-list");
  const badge = document.getElementById("participant-badge");

  document.getElementById("participant-count").textContent = `Total: ${count}`;
  ul.innerHTML = "";
  list.forEach(name => {
    const li = document.createElement("li");
    li.textContent = name;
    ul.appendChild(li);
  });

  if (count > 0) {
    badge.style.display = "inline-block";
    badge.textContent = count;
  } else {
    badge.style.display = "none";
  }
}

function validateAndGoToChat() {
  nickname = nickname || document.getElementById("nickname").value.trim();
  if (!nickname) return alert("Please enter your name.");

  localStorage.setItem('nickname', nickname);
  localStorage.setItem('role', 'host');

  nicknames[peer.id] = nickname;
  updateParticipantDisplay();
  broadcastParticipantList();
  switchScreen(true);
  clearChat();
}

function sendMessage() {
  const msgText = document.getElementById("message").value;
  if (!msgText) return;
  document.getElementById("message").value = '';
  const msg = `${nickname}: ${msgText}`;
  log("🔵 " + msg);
  if (isHost) {
    connections.forEach(c => c.send("🔷 " + msg));
  } else {
    conn.send("🔵 " + msg);
  }
}

function log(msg, options = {}) {
  const box = document.getElementById("chat-box");

  const outer = document.createElement("div");
  const bubble = document.createElement("div");
  const content = document.createElement("span");
  const time = document.createElement("span");

  const now = new Date();
  const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Set content and timestamp
  content.textContent = msg;
  time.className = "timestamp";
  time.textContent = timestamp;

  bubble.appendChild(content);
  bubble.appendChild(time);

  // System messages
  if (msg.includes("joined the room") || msg.includes("left the room") || msg.includes("Host disconnected")) {
    bubble.className = "system-msg";
    bubble.textContent = `${msg}`;
    outer.className = "system-msg-container";
    outer.appendChild(bubble);
  } else {
    bubble.className = "chat-bubble";

    // Own vs Other alignment
	const plainMsg = msg.replace(/^🔵|^🔷|\s*/g, '');
	const isOwn = plainMsg.startsWith(`${nickname}:`);

    if (isOwn) {
	  outer.className = "bubble-wrapper right";
	  bubble.classList.add("own-message");
	} else {
	  outer.className = "bubble-wrapper left";
	}
    outer.appendChild(bubble);
  }

  box.appendChild(outer);
  box.scrollTop = box.scrollHeight;
}



function clearChat() {
  document.getElementById("chat-box").innerHTML = "";
}

function switchScreen(toChat) {
  document.getElementById("home-screen").classList.toggle("active", !toChat);
  document.getElementById("chat-screen").classList.toggle("active", toChat);
  document.getElementById("host-id-bar").style.display = (toChat && isHost) ? "block" : "none";
}

function exitRoom() {
  manualExit = true;
  if (conn) conn.close();
  connections.forEach(c => c.close());
  connections = [];
  nicknames = isHost ? { [peer.id]: nickname } : {};
  updateParticipantDisplay();
  switchScreen(false);
  setupNicknameField();
}

function copyID() {
  const id = document.getElementById("my-id").textContent;
  navigator.clipboard.writeText(id).then(() => alert("Copied to clipboard!"));
}

function shareID() {
  const id = document.getElementById("my-id").textContent;
  const baseURL = window.location.origin + window.location.pathname;
  const shareURL = `${baseURL}?join=${id}`;
  if (navigator.share) {
    navigator.share({ title: "Join me on Pingo Chat", text: "Here is my chat ID:", url: shareURL });
  } else {
    alert("Sharing not supported on this device.");
  }
}

function showPeopleModal() {
  document.getElementById("people-modal").style.display = "block";
  document.getElementById("modal-bg").style.display = "block";
}

function hidePeopleModal() {
  document.getElementById("people-modal").style.display = "none";
  document.getElementById("modal-bg").style.display = "none";
}

function updateModeUI() {
  const isJoiner = !isHost;
  document.getElementById("host-id-section").style.display = isHost ? "block" : "none";
  document.getElementById("joiner-id-section").style.display = isJoiner ? "block" : "none";
  document.getElementById("go-to-chat").style.display = isHost ? "block" : "none";
  document.getElementById("join-btn").style.display = isJoiner ? "block" : "none";
  document.getElementById("mode-msg").innerHTML = isHost
    ? "🔵 You are HOST. Share your ID."
    : "🔷 You are JOINER. Enter host ID.";
}

function switchMode() {
  isHost = !isHost;
  localStorage.setItem('role', isHost ? 'host' : 'joiner');
  location.hash = isHost ? "#host" : "";
  updateModeUI();
  setupNicknameField();
}

function setupNicknameField() {
  const nameInput = document.getElementById("nickname");
  if (!nameInput) return;

  if (nickname) {
    nameInput.style.display = "none";
    let label = document.getElementById("nickname-label");
    if (!label) {
      label = document.createElement("div");
      label.id = "nickname-label";
      nameInput.parentElement.insertBefore(label, nameInput);
    } 
    label.innerHTML = `Hello, <strong>${nickname}</strong> <span style="cursor:pointer;color:#6200ee;" onclick="editNickname()">✏️</span>`;
  } else {
    nameInput.style.display = "block";
    const existing = document.getElementById("nickname-label");
    if (existing) existing.remove();
  }
}

function editNickname() {
  const nameInput = document.getElementById("nickname");
  localStorage.removeItem('nickname');
  nickname = "";
  const label = document.getElementById("nickname-label");
  if (label) label.remove();
  nameInput.style.display = "block";
  nameInput.focus();
}
/*3 dots onclick */
function toggleDropdown() {
  const menu = document.getElementById("dropdown-menu");
  menu.style.display = (menu.style.display === "block") ? "none" : "block";
}

window.addEventListener('click', function (e) {
  if (!e.target.matches('.three-dots')) {
    const dropdowns = document.getElementsByClassName("dropdown-menu");
    for (let d of dropdowns) d.style.display = "none";
  }
});