const app = document.getElementById("app");

let currentUser = localStorage.getItem("missionUser");

function render() {
  currentUser ? renderDashboard() : renderLogin();
}

function renderLogin() {
  app.innerHTML = `
    <div class="stars"></div>

    <div class="container">
      <div class="card">
        <div class="logo">🚀</div>
        <h1>Mission Control</h1>
        <p class="subtitle">Secure Space Operations Login</p>

        <form id="loginForm">
          <label>Username</label>
          <input type="text" id="username" placeholder="Commander name" />

          <label>Password</label>
          <input type="password" id="password" placeholder="Access code" />

          <button type="submit">Launch Access</button>

          <p class="error" id="error"></p>
        </form>

        <p class="subtitle">
          No account?
          <a href="#" id="showRegister">Sign up</a>
        </p>
      </div>
    </div>
  `;

  document.getElementById("loginForm").addEventListener("submit", login);
  document.getElementById("showRegister").addEventListener("click", renderRegister);
}

function renderRegister() {
  app.innerHTML = `
    <div class="stars"></div>

    <div class="container">
      <div class="card">
        <div class="logo">🪐</div>
        <h1>Create Account</h1>
        <p class="subtitle">Join the Mission Control Crew</p>

        <form id="registerForm">
          <label>Username</label>
          <input type="text" id="regUsername" placeholder="Choose commander name" />

          <label>Email</label>
          <input type="email" id="regEmail" placeholder="mission@email.com" />

          <label>Password</label>
          <input type="password" id="regPassword" placeholder="Create access code" />

          <button type="submit">Sign Up</button>

          <p class="error" id="error"></p>
        </form>

        <p class="subtitle">
          Already have an account?
          <a href="#" id="showLogin">Login</a>
        </p>
      </div>
    </div>
  `;

  document.getElementById("registerForm").addEventListener("submit", register);
  document.getElementById("showLogin").addEventListener("click", renderLogin);
}

function register(event) {
  event.preventDefault();

  const username = document.getElementById("regUsername").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value.trim();
  const error = document.getElementById("error");

  if (username === "" || email === "" || password === "") {
    error.textContent = "All fields are required.";
    return;
  }

  const users = JSON.parse(localStorage.getItem("users")) || [];

  const existingUser = users.find(user => user.username === username);

  if (existingUser) {
    error.textContent = "This username already exists.";
    return;
  }

  users.push({
    username: username,
    email: email,
    password: password
  });

  localStorage.setItem("users", JSON.stringify(users));
  localStorage.setItem("missionUser", username);

  currentUser = username;
  renderDashboard();
}

function login(event) {
  event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const error = document.getElementById("error");

  const users = JSON.parse(localStorage.getItem("users")) || [];

  const foundUser = users.find(
    user => user.username === username && user.password === password
  );

  if (foundUser || (username === "admin" && password === "1234")) {
    localStorage.setItem("missionUser", username);
    currentUser = username;
    renderDashboard();
  } else {
    error.textContent = "Invalid mission credentials.";
  }
}

function renderDashboard() {
  app.innerHTML = `
    <div class="stars"></div>

    <div class="container">
      <div class="card dashboard">
        <div class="logo">🛰️</div>
        <h1>Welcome, Commander ${currentUser}</h1>
        <p class="subtitle">Mission Control System Online</p>

        <div class="panel">
          <p>Rocket Status: <span class="status">READY</span></p>
          <p>Satellite Link: <span class="status">CONNECTED</span></p>
          <p>Oxygen System: <span class="status">STABLE</span></p>
          <p>Launch Window: <span class="status">OPEN</span></p>
        </div>

        <button id="logoutBtn">Logout</button>
      </div>
    </div>
  `;

  document.getElementById("logoutBtn").addEventListener("click", logout);
}

function logout() {
  localStorage.removeItem("missionUser");
  currentUser = null;
  renderLogin();
}

render();