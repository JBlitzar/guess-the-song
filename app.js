var redirect_uri = window.location.origin + window.location.pathname;

// Explicit token vars so we can clear them in-memory when invalidated
let access_token = null;
let refresh_token = null;

// Use Vercel API endpoints
const VERCEL_AUTH_URL =
  "https://vercel-gadgets.vercel.app/spotify_request_auth";
const VERCEL_TOKEN_URL =
  "https://vercel-gadgets.vercel.app/spotify_request_token";
const VERCEL_PLAYLISTS_URL =
  "https://vercel-gadgets.vercel.app/spotify_playlists";
const VERCEL_TRACKS_URL = "https://vercel-gadgets.vercel.app/spotify_tracks";

let allTracks = [];
// Song source mode: 'all_playlists' | 'my_playlists' | 'liked_songs'
let sourceMode = localStorage.getItem("sourceMode") || "all_playlists";
let currentUser = null; // will hold /me response

// Simple UI error reporting helper
function showError(err, context) {
  const el = document.getElementById("fetching");
  const detail = err && err.stack ? err.stack : err && err.message ? err.message : String(err);
  const msg = context ? `${context}: ${detail}` : detail;
  if (el) el.innerText = msg;
  try {
    alert(msg);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Spotify embed player UI configuration (tweak values here as desired)
// ---------------------------------------------------------------------------
const PLAYER_WIDTH = 320; // iframe width in pixels
const PLAYER_VIEWPORT_HEIGHT = 34; // visible crop height (px)
const PLAYER_TRANSLATE_Y = 113; // shift iframe up (px) to hide metadata

function onPageLoad() {
  if (window.location.search.length > 0) {
    const fetchEl = document.getElementById("fetching");
    if (fetchEl) fetchEl.innerText = "Completing Spotify authorization...";
    handleRedirect();
  } else {
    access_token = localStorage.getItem("access_token");
    // Ensure dropdown reflects persisted mode
    setSourceSelector();
    // Post-auth status messaging
    const fetchEl = document.getElementById("fetching");
    const authFlow = localStorage.getItem("authFlow");
    const authResult = localStorage.getItem("authResult");
    if (fetchEl) {
      if (authFlow && authResult === "success") {
        // If an action will auto-resume, show concise status
        const pending = localStorage.getItem("postAuthAction");
        if (pending === "fetch") {
          fetchEl.innerText = "Authorized. Fetching your music...";
        } else {
          fetchEl.innerText =
            "Authorization successful. Click 'Fetch Songs' to continue.";
        }
        ("Authorization successful. Click 'Fetch Songs' (again) to continue.");
      } else if (authFlow && authResult === "error") {
        fetchEl.innerText =
          "Authorization failed. Please try 'Fetch Songs' again.";
      } else {
        // Neutral default message
        fetchEl.innerText = "Choose a source and click 'Fetch Songs'";
      }
    }
    // Clear auth flow flags after messaging
    if (authFlow || authResult) {
      localStorage.removeItem("authFlow");
      localStorage.removeItem("authResult");
    }
  }
}

function handleRedirect() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  const code = params.get("code");

  if (error || !code) {
    localStorage.setItem("authResult", "error");
    // ensure tokens cleared
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    access_token = null;
    refresh_token = null;
    const el = document.getElementById("fetching");
    if (el) el.innerText = `Authorization failed${error ? ": " + error : ""}.`;
  } else {
    fetchAccessToken(code);
  }
  window.history.pushState("", "", redirect_uri);
}

function getCode() {
  let code = null;
  const queryString = window.location.search;
  if (queryString.length > 0) {
    const urlParams = new URLSearchParams(queryString);
    code = urlParams.get("code");
  }
  return code;
}

function requestAuthorization() {
  let url = VERCEL_AUTH_URL;
  url += "?redirect_uri=" + encodeURIComponent(redirect_uri);
  url +=
    "&scope=" +
    encodeURIComponent(
      "user-read-private user-read-email playlist-read-private user-library-read"
    );
  // mark that we're entering auth flow so we can show a post-auth message
  localStorage.setItem("authFlow", "1");
  window.location.href = url;
}

function fetchAccessToken(code) {
  let url = VERCEL_TOKEN_URL;
  url += "?code=" + code;
  url += "&redirect_uri=" + encodeURIComponent(redirect_uri);

  fetch(url)
    .then((response) => response.json())
    .then((data) => {
      console.log(data);
      if (data.access_token != undefined) {
        access_token = data.access_token;
        localStorage.setItem("access_token", access_token);
      }
      if (data.refresh_token != undefined) {
        refresh_token = data.refresh_token;
        localStorage.setItem("refresh_token", refresh_token);
      }
      // mark success for user messaging
      localStorage.setItem("authResult", "success");
    })
    .catch((error) => {
      localStorage.setItem("authResult", "error");
      // clear any stale tokens in memory as well
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      access_token = null;
      refresh_token = null;
      showError(error, "Error getting access token");
    })
    .finally(() => {
      // auto-resume pending action (e.g., fetch) after successful auth
      const pending = localStorage.getItem("postAuthAction");
      if (
        pending === "fetch" &&
        localStorage.getItem("authResult") === "success"
      ) {
        localStorage.removeItem("postAuthAction");
        onPageLoad();
        // slight delay to allow UI to reflect
        setTimeout(() => {
          fetchAllPlaylistsAndTracks();
        }, 0);
        return;
      }
      onPageLoad();
    });
}

async function fetchAllPlaylistsAndTracks() {
  console.log(`Starting fetch flow for mode=${sourceMode}`);
  allTracks = [];

  // reset UI counters
  document.getElementById("fetchAmt").innerText = "";
  document.getElementById("playlistsFetched").innerText = "";

  // If no token, initiate auth once and return (avoid loops)
  access_token = localStorage.getItem("access_token");
  if (!access_token) {
    localStorage.setItem("postAuthAction", "fetch");
    const el = document.getElementById("fetching");
    if (el) el.innerText = "Authorizing with Spotify...";
    requestAuthorization();
    return;
  }

  try {
    if (sourceMode === "liked_songs") {
      document.getElementById("fetching").innerText = "Fetching liked songs...";
      allTracks = await fetchLikedTracks();
    } else {
      document.getElementById("fetching").innerText =
        "Fetching playlists and tracks...";

      let playlists = await fetchAllPlaylists();

      if (sourceMode === "my_playlists") {
        if (!currentUser) {
          currentUser = await fetchCurrentUser();
        }
        playlists = playlists.filter(
          (p) => p.owner && p.owner.id === currentUser.id
        );
      }

      console.log(`Playlists considered: ${playlists.length}`);
      window._maxplaylists = playlists.length;

      const trackPromises = playlists.map((playlist, index) => {
        console.log(`Starting fetch for playlist: ${playlist.name}`);

        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(fetchTracksFromPlaylist(playlist.id));
          }, index * 500); // avoid 429
        });
      });

      const tracksArrays = await Promise.all(trackPromises);
      allTracks = tracksArrays.flat();
    }

    console.log(`Total tracks collected: ${allTracks.length}`);
    console.log("All tracks:", allTracks);

    const uniqueTracks = allTracks.filter(
      (track, index, array) =>
        array.findIndex((t) => t.uri === track.uri) === index
    );
    allTracks = uniqueTracks;
    console.log(`Unique tracks after removing duplicates: ${allTracks.length}`); // yeah haha zero

    window._tracks = uniqueTracks;

    const playableTracks = uniqueTracks.filter((t) => t.preview_url !== null);
    console.log(playableTracks);

    document.getElementById("fetching").innerText = "Done!";
  } catch (error) {
    console.error("Error fetching playlists and tracks:", error);
    showError(error, "Error fetching playlists and tracks");
        "Authorization required or fetch failed. Click 'Fetch Songs' to try again.";
  }
}

async function fetchCurrentUser() {
  if (currentUser) return currentUser;
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: "Bearer " + access_token },
  });
  if (response.status === 200) {
    currentUser = await response.json();
    return currentUser;
  } else if (response.status === 401 || response.status === 403) {
    localStorage.removeItem("access_token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    access_token = null;
    refresh_token = null;
    const el = document.getElementById("fetching");
    if (el)
      el.innerText =
        "Authorization expired (yikes). Click 'Fetch Songs' to re-authorize.";
    throw new Error("Unauthorized fetching current user");
  } else {
    throw new Error(await response.text());
  }
}

async function fetchLikedTracks() {
  let liked = [];
  let url = "https://api.spotify.com/v1/me/tracks?limit=50";
  while (url) {
    const resp = await fetch(url, {
      headers: { Authorization: "Bearer " + access_token },
    });
    if (resp.status === 200) {
      const data = await resp.json();
      const batch = data.items.map((item) => ({
        name: item.track.name,
        artist: item.track.artists[0].name,
        album: item.track.album.name,
        playlistId: null,
        uri: item.track.uri,
        preview_url: item.track.preview_url,
      }));
      liked = liked.concat(batch);

      // update UI counter
      document.getElementById("fetchAmt").innerText =
        (parseInt(document.getElementById("fetchAmt").innerText || 0) || 0) +
        batch.length;

      url = data.next;
    } else if (resp.status === 401 || resp.status === 403) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      access_token = null;
      refresh_token = null;
      const el = document.getElementById("fetching");
      if (el)
        el.innerText =
          "Authorization expired. Click 'Fetch Songs' to re-authorize.";
      throw new Error("Unauthorized while fetching liked songs");
    } else {
      throw new Error(await resp.text());
    }
  }
  document.getElementById("playlistsFetched").innerText = "";
  return liked;
}

function onSourceChange(newMode) {
  sourceMode = newMode;
  localStorage.setItem("sourceMode", sourceMode);
  setSourceSelector();
  // reset UI indicators
  document.getElementById("fetchAmt").innerText = "";
  document.getElementById("playlistsFetched").innerText = "";
  document.getElementById("fetching").innerText =
    "Source changed. Click 'Fetch Songs'";
}

function setSourceSelector() {
  const sel = document.getElementById("sourceMode");
  if (sel) {
    sel.value = sourceMode;
  }
}

function startGame() {
  if (window._tracks.length === 0) {
    alert(
      "No tracks available to play. Either an authorization error or you don't have any tracks in your playlists."
    );
    return;
  }

  runTurn();
}
function runTurn() {
  const track =
    window._tracks[Math.floor(Math.random() * window._tracks.length)];
  window._currentTrack = track;

  // ensure player container is ready
  const playerContainer = document.getElementById("playerContainer");
  if (playerContainer) {
    playerContainer.innerHTML = "";
  }

  const trackId = track.uri.split(":")[2];

  // wrapper that masks the top part of Spotify embed
  const wrapper = document.createElement("div");
  wrapper.classList.add("parentDiv");
  wrapper.style.width = `${PLAYER_WIDTH}px`;
  wrapper.style.height = `${PLAYER_VIEWPORT_HEIGHT}px`;
  wrapper.style.overflow = "hidden";
  wrapper.style.margin = "16px auto";
  wrapper.style.position = "relative";
  wrapper.style.display = "block";
  // start hidden to avoid flash of metadata while loading
  wrapper.style.opacity = "0.00000001";
  wrapper.style.transition = "opacity 150ms ease-in";

  const iframe = document.createElement("iframe");
  iframe.src = `https://open.spotify.com/embed/track/${trackId}`;
  iframe.width = String(PLAYER_WIDTH);
  iframe.height = "152"; // full height of Spotify embed
  iframe.style.border = "0";
  iframe.style.display = "block";
  // shift up to show only the bottom portion (controls)
  iframe.style.transform = `translateY(-${PLAYER_TRANSLATE_Y}px)`;
  iframe.allow = "encrypted-media";
  iframe.allowTransparency = "true";

  // reveal player once fully loaded
  iframe.addEventListener("load", () => {
    // next micro-task to ensure styles were applied
    setTimeout(() => {
      wrapper.style.opacity = "1";
    }, 0);
  });

  wrapper.appendChild(iframe);

  if (playerContainer) {
    playerContainer.appendChild(wrapper);
  } else {
    // fallback
    document.body.appendChild(wrapper);
  }

  document.getElementById("gameStatus").innerText = "Press play...";
  document.getElementById("guess").value = "";
  document.getElementById("guess").disabled = false;
}

function checkGuess() {
  var guess = document.getElementById("guess").value.trim().toLowerCase();
  // clear embedded player container if present
  const playerContainer = document.getElementById("playerContainer");
  if (playerContainer) {
    playerContainer.innerHTML = "";
  }
  // Remove any leftover Spotify embed wrappers
  document.querySelectorAll(".parentDiv").forEach((el) => el.remove());
  document.getElementById("guess").disabled = true;
  document.getElementById("gameHistory").innerHTML += `<br>`;
  document.getElementById(
    "gameHistory"
  ).innerText += `Song: ${window._currentTrack.name} Guessed: ${guess}`;

  // Prompt user to start the next round
  document.getElementById("gameStatus").innerText = "Press start to play again";
}

function fetchAllPlaylists() {
  return new Promise((resolve, reject) => {
    fetch(VERCEL_PLAYLISTS_URL, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + access_token,
      },
    })
      .then((response) => {
        if (response.status === 200) {
          return response.json();
        } else if (response.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          access_token = null;
          refresh_token = null;
          access_token = null;
          refresh_token = null;
          if (el)
            el.innerText =
              "Authorization expired. Click 'Fetch Songs' to re-authorize.";
          throw new Error("Token expired");
        } else if (response.status === 429) {
          showError(
            "Rate limit exceeded. Please try waiting a bit and subsequently reloading.",
            "Spotify API"
          );
        } else {
          throw new Error(response.statusText);
        }
      })
      .then((data) => resolve(data.items))
      .catch((error) => reject(error));
  });
}

function fetchTracksFromPlaylist(playlistId) {
  return new Promise((resolve, reject) => {
    const url = `${VERCEL_TRACKS_URL}?playlist_id=${playlistId}`;
    fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + access_token,
      },
    })
      .then((response) => {
        if (response.status === 200) {
          return response.json();
        } else if (response.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          localStorage.setItem("postAuthAction", "fetch");
          const el = document.getElementById("fetching");
          if (el)
            el.innerText =
              "Authorization expired. Click 'Fetch Songs' to re-authorize.";
          throw new Error("Token expired");
        } else if (response.status === 429) {
          showError(
            "Rate limit exceeded. Please try waiting a bit and subsequently reloading.",
            "Spotify API"
          );
        } else {
          throw new Error(response.statusText);
        }
      })
      .then((data) => {
        const tracks = data.items.map((item) => ({
          name: item.track.name,
          artist: item.track.artists[0].name,
          album: item.track.album.name,
          playlistId: playlistId,
          uri: item.track.uri,
          preview_url: item.track.preview_url,
        }));
        document.getElementById("fetchAmt").innerText =
          parseInt(document.getElementById("fetchAmt").innerText || 0) +
          tracks.length;
        resolve(tracks);

        document.getElementById("playlistsFetched").innerText = `${
          parseInt(
            document
              .getElementById("playlistsFetched")
              .innerText.split("/")[0] || 0
          ) + 1
        }/${window._maxplaylists}`;

        let el = document.getElementById("playlistsFetched").innerText;
        if (parseInt(el.split("/")[0]) >= window._maxplaylists) {
          document.getElementById("fetching").innerText = "Done!";
        }
      })
      .catch((error) => reject(error));
  });
}
