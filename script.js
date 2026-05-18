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
          <input
            type="text"
            id="username"
            placeholder="Commander name"
          />

          <label>Password</label>
          <input
            type="password"
            id="password"
            placeholder="Access code"
          />

          <button type="submit">
            Launch Access
          </button>

          <p class="error" id="error"></p>
        </form>

        <p class="subtitle">
          No account?
          <a href="#" id="showRegister">
            Sign up
          </a>
        </p>
      </div>
    </div>
  `;

  document
    .getElementById("loginForm")
    .addEventListener("submit", login);

  document
    .getElementById("showRegister")
    .addEventListener("click", renderRegister);
}

function renderRegister() {
  app.innerHTML = `
    <div class="stars"></div>

    <div class="container">
      <div class="card">
        <div class="logo">🪐</div>

        <h1>Create Account</h1>
        <p class="subtitle">
          Join the Mission Control Crew
        </p>

        <form id="registerForm">
          <label>Username</label>
          <input
            type="text"
            id="regUsername"
            placeholder="Choose commander name"
          />

          <label>Email</label>
          <input
            type="email"
            id="regEmail"
            placeholder="mission@email.com"
          />

          <label>Password</label>
          <input
            type="password"
            id="regPassword"
            placeholder="Create access code"
          />

          <button type="submit">
            Sign Up
          </button>

          <p class="error" id="error"></p>
        </form>

        <p class="subtitle">
          Already have an account?
          <a href="#" id="showLogin">
            Login
          </a>
        </p>
      </div>
    </div>
  `;

  document
    .getElementById("registerForm")
    .addEventListener("submit", register);

  document
    .getElementById("showLogin")
    .addEventListener("click", renderLogin);
}

function register(event) {
  event.preventDefault();

  const username =
    document.getElementById("regUsername").value.trim();

  const email =
    document.getElementById("regEmail").value.trim();

  const password =
    document.getElementById("regPassword").value.trim();

  const error =
    document.getElementById("error");

  if (
    username === "" ||
    email === "" ||
    password === ""
  ) {
    error.textContent =
      "All fields are required.";

    return;
  }

  const users =
    JSON.parse(localStorage.getItem("users")) || [];

  const existingUser =
    users.find(user => user.username === username);

  if (existingUser) {
    error.textContent =
      "This username already exists.";

    return;
  }

  users.push({
    username,
    email,
    password
  });

  localStorage.setItem(
    "users",
    JSON.stringify(users)
  );

  localStorage.setItem(
    "missionUser",
    username
  );

  currentUser = username;

  renderDashboard();
}

function login(event) {
  event.preventDefault();

  const username =
    document.getElementById("username").value.trim();

  const password =
    document.getElementById("password").value.trim();

  const error =
    document.getElementById("error");

  const users =
    JSON.parse(localStorage.getItem("users")) || [];

  const foundUser = users.find(
    user =>
      user.username === username &&
      user.password === password
  );

  if (
    foundUser ||
    (username === "admin" && password === "1234")
  ) {
    localStorage.setItem(
      "missionUser",
      username
    );

    currentUser = username;

    renderDashboard();
  } else {
    error.textContent =
      "Invalid mission credentials.";
  }
}

function renderDashboard() {
  app.innerHTML = `
    <div class="stars"></div>

    <div class="main-page">

      <header class="top-bar">

  <h2>🚀 Space Mission Control</h2>

  <div class="header-search">

    <input
      type="text"
      id="searchInput"
      placeholder="Search spacecraft..."
    />

    <button id="searchBtn">
      Search
    </button>

  </div>

  <button id="logoutBtn">
    Logout
  </button>

</header>

      <main class="dashboard-grid">

        <section class="main-window">

          <h1>Mission Main Window</h1>

          <p>Earth Orbit Monitoring System</p>

          <div id="searchResult" class="search-result">

            <div class="planet">
              🌍
            </div>

            <div class="mission-info">
              <p>
                Status:
                <span class="status">
                  ONLINE
                </span>
              </p>

              <p>
                Current Mission:
                Artemis Deep Space Scan
              </p>

              <p>
                Commander:
                ${currentUser}
              </p>
            </div>

          </div>

        </section>

        <aside class="favorites">

          <h2>
            Favourite Spacecrafts
          </h2>

          <div class="craft-card">
            <h3>🚀 Apollo 11</h3>
            <p>Status: Historical</p>
          </div>

          <div class="craft-card">
            <h3>🛰️ ISS</h3>
            <p>Status: Active</p>
          </div>

          <div class="craft-card">
            <h3>🚀 SpaceX Dragon</h3>
            <p>Status: Docked</p>
          </div>

          <div class="craft-card">
            <h3>🛸 Voyager 1</h3>
            <p>Status: Deep Space</p>
          </div>

          <div class="craft-card">
            <h3>🌕 Artemis</h3>
            <p>Status: Preparing</p>
          </div>

        </aside>

      </main>

      <section class="statistics">

        <h2>
          Aircraft Statistics
        </h2>

        <div class="stats-grid">

          <div class="stat-card">
            <h3>Velocity</h3>
            <p>27,500 km/h</p>
          </div>

          <div class="stat-card">
            <h3>Altitude</h3>
            <p>408 km</p>
          </div>

          <div class="stat-card">
            <h3>Fuel</h3>
            <p>82%</p>
          </div>

          <div class="stat-card">
            <h3>Oxygen</h3>
            <p>96%</p>
          </div>

          <div class="stat-card">
            <h3>Signal</h3>
            <p>Stable</p>
          </div>

        </div>

      </section>

    </div>
  `;

  const spacecrafts = {
    apollo: {
      icon: "🚀",
      name: "Apollo 11",
      mission: "First Moon Landing",
      status: "Completed",
      speed: "39,897 km/h"
    },

    iss: {
      icon: "🛰️",
      name: "International Space Station",
      mission: "Earth Orbit Research",
      status: "Active",
      speed: "27,600 km/h"
    },

    dragon: {
      icon: "🚀",
      name: "SpaceX Dragon",
      mission: "Cargo & Crew Transport",
      status: "Docked",
      speed: "28,000 km/h"
    },

    voyager: {
      icon: "🛸",
      name: "Voyager 1",
      mission: "Interstellar Exploration",
      status: "Deep Space",
      speed: "61,000 km/h"
    },

    artemis: {
      icon: "🌕",
      name: "Artemis",
      mission: "Moon Exploration",
      status: "Preparing",
      speed: "32,000 km/h"
    }
  };

  document
    .getElementById("searchBtn")
    .addEventListener("click", searchAircraft);

  function searchAircraft() {
    const value =
      document
        .getElementById("searchInput")
        .value
        .toLowerCase()
        .trim();

    const result =
      document.getElementById("searchResult");

    if (spacecrafts[value]) {
      const craft = spacecrafts[value];

      result.innerHTML = `
        <div class="aircraft-display">

          <div class="aircraft-icon">
            ${craft.icon}
          </div>

          <h2>
            ${craft.name}
          </h2>

          <div class="mission-info">

            <p>
              Mission:
              ${craft.mission}
            </p>

            <p>
              Status:
              <span class="status">
                ${craft.status}
              </span>
            </p>

            <p>
              Speed:
              ${craft.speed}
            </p>

          </div>

        </div>
      `;
    } else {
      result.innerHTML = `
        <div class="not-found">
          ❌ Aircraft not found
        </div>
      `;
    }
  }

  document
    .getElementById("logoutBtn")
    .addEventListener("click", logout);
}

function logout() {
  localStorage.removeItem("missionUser");

  currentUser = null;

  renderLogin();
}

render();