var redirect_uri = window.location.origin + window.location.pathname;

// Use Vercel API endpoints
const VERCEL_AUTH_URL =
  "https://vercel-gadgets.vercel.app/spotify_request_auth";
const VERCEL_TOKEN_URL =
  "https://vercel-gadgets.vercel.app/spotify_request_token";
const VERCEL_PLAYLISTS_URL =
  "https://vercel-gadgets.vercel.app/spotify_playlists";
const VERCEL_TRACKS_URL = "https://vercel-gadgets.vercel.app/spotify_tracks";

let allTracks = [];

function onPageLoad() {
  if (window.location.search.length > 0) {
    handleRedirect();
  } else {
    access_token = localStorage.getItem("access_token");

    fetchAllPlaylistsAndTracks();
  }
}

function handleRedirect() {
  let code = getCode();
  fetchAccessToken(code);
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
      "user-read-private user-read-email playlist-read-private"
    );
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
      onPageLoad();
    })
    .catch((error) => {
      console.log(error);
      alert("Error getting access token: " + error);
    });
}

async function fetchAllPlaylistsAndTracks() {
  console.log("Starting to fetch all playlists and tracks...");
  allTracks = [];

  try {
    const playlists = await fetchAllPlaylists();
    console.log(`Found ${playlists.length} playlists`);
    window._maxplaylists = playlists.length;

    const trackPromises = playlists.map((playlist, index) => {
      console.log(`Starting fetch for playlist: ${playlist.name}`);

      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(fetchTracksFromPlaylist(playlist.id));
        }, index * 500); // otherwise 429
      });
    });

    const tracksArrays = await Promise.all(trackPromises);

    allTracks = tracksArrays.flat();

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
  } catch (error) {
    console.error("Error fetching playlists and tracks:", error);
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
  var track = window._tracks[Math.floor(Math.random() * window._tracks.length)];
  window._currentTrack = track;

  var trackId = track.uri.split(":")[2];
  var iframe = document.createElement("iframe");
  iframe.src = `https://open.spotify.com/embed/track/${trackId}`;
  iframe.width = "230";
  iframe.height = "100";
  iframe.frameBorder = "0";
  iframe.allowTransparency = "true";
  iframe.allow = "encrypted-media";

  var hider = document.createElement("div");
  hider.style.position = "absolute";
  hider.style.top = "0";
  hider.style.left = "0";
  hider.style.width = "200";
  hider.style.height = "100";
  hider.style.backgroundColor = "black";

  var parentDiv = document.createElement("div");
  parentDiv.appendChild(iframe);
  parentDiv.appendChild(hider);
  parentDiv.classList.add("parentDiv");

  document.body.appendChild(parentDiv);

  document.getElementById("gameStatus").innerText = "Press play...";
  document.getElementById("guess").value = "";
  document.getElementById("guess").disabled = false;
}

function checkAnswer() {
  var guess = document.getElementById("guess").value.trim().toLowerCase();
  $(".parentDiv").remove();
  document.getElementById("guess").disabled = true;
  document.getElementById(
    "gameStatus"
  ).innerText = `${window._currentTrack.name} by ${window._currentTrack.artists[0].name} Guessed: ${guess}`;
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
          requestAuthorization();
          throw new Error("Token expired");
        } else if (response.status === 429) {
          alert(
            "Rate limit exceeded. Please try waiting a bit and subsequently reloading."
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
          requestAuthorization();
          throw new Error("Token expired");
        } else if (response.status === 429) {
          alert(
            "Rate limit exceeded. Please try waiting a bit and subsequently reloading."
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
      })
      .catch((error) => reject(error));
  });
}
