//var redirect_uri = "https://makeratplay.github.io/SpotifyWebAPI/"; // change this your value
var redirect_uri = "http://127.0.0.1:5500/index.html";

var client_id = "";
var client_secret = "";
var access_token = null;
var refresh_token = null;

const AUTHORIZE = "https://accounts.spotify.com/authorize";
const TOKEN = "https://accounts.spotify.com/api/token";
const PLAYLISTS = "https://api.spotify.com/v1/me/playlists";
const TRACKS = "https://api.spotify.com/v1/playlists/{{PlaylistId}}/tracks";

let allTracks = [];

function onPageLoad() {
  client_id = localStorage.getItem("client_id");
  client_secret = localStorage.getItem("client_secret");

  if (window.location.search.length > 0) {
    handleRedirect();
  } else {
    access_token = localStorage.getItem("access_token");
    if (access_token == null) {
      document.getElementById("tokenSection").style.display = "block";
    } else {
      document.getElementById("mainSection").style.display = "block";
      fetchAllPlaylistsAndTracks();
    }
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
  client_id = document.getElementById("clientId").value;
  client_secret = document.getElementById("clientSecret").value;
  localStorage.setItem("client_id", client_id);
  localStorage.setItem("client_secret", client_secret);

  let url = AUTHORIZE;
  url += "?client_id=" + client_id;
  url += "&response_type=code";
  url += "&redirect_uri=" + encodeURI(redirect_uri);
  url += "&show_dialog=true";
  url += "&scope=user-read-private user-read-email playlist-read-private";
  window.location.href = url;
}

function fetchAccessToken(code) {
  let body = "grant_type=authorization_code";
  body += "&code=" + code;
  body += "&redirect_uri=" + encodeURI(redirect_uri);
  body += "&client_id=" + client_id;
  body += "&client_secret=" + client_secret;
  callAuthorizationApi(body);
}

function refreshAccessToken() {
  refresh_token = localStorage.getItem("refresh_token");
  let body = "grant_type=refresh_token";
  body += "&refresh_token=" + refresh_token;
  body += "&client_id=" + client_id;
  callAuthorizationApi(body);
}

function callAuthorizationApi(body) {
  let xhr = new XMLHttpRequest();
  xhr.open("POST", TOKEN, true);
  xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  xhr.setRequestHeader(
    "Authorization",
    "Basic " + btoa(client_id + ":" + client_secret)
  );
  xhr.send(body);
  xhr.onload = handleAuthorizationResponse;
}

function handleAuthorizationResponse() {
  if (this.status == 200) {
    var data = JSON.parse(this.responseText);
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
  } else {
    console.log(this.responseText);
    alert(this.responseText);
  }
}

function callApi(method, url, body, callback) {
  let xhr = new XMLHttpRequest();
  xhr.open(method, url, true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("Authorization", "Bearer " + access_token);
  xhr.send(body);
  xhr.onload = callback;
}

async function fetchAllPlaylistsAndTracks() {
  console.log("Starting to fetch all playlists and tracks...");
  allTracks = [];

  try {
    const playlists = await fetchAllPlaylists();
    console.log(`Found ${playlists.length} playlists`);

    for (let playlist of playlists) {
      console.log(`Fetching tracks for playlist: ${playlist.name}`);
      const tracks = await fetchTracksFromPlaylist(playlist.id);
      allTracks.push(...tracks);
    }

    console.log(`Total tracks collected: ${allTracks.length}`);
    console.log("All tracks:", allTracks);
  } catch (error) {
    console.error("Error fetching playlists and tracks:", error);
  }
}

function fetchAllPlaylists() {
  return new Promise((resolve, reject) => {
    callApi("GET", PLAYLISTS, null, function () {
      if (this.status == 200) {
        var data = JSON.parse(this.responseText);
        resolve(data.items);
      } else if (this.status == 401) {
        refreshAccessToken();
        reject("Token expired");
      } else {
        reject(this.responseText);
      }
    });
  });
}

function fetchTracksFromPlaylist(playlistId) {
  return new Promise((resolve, reject) => {
    const url = TRACKS.replace("{{PlaylistId}}", playlistId);
    callApi("GET", url, null, function () {
      if (this.status == 200) {
        var data = JSON.parse(this.responseText);
        const tracks = data.items.map((item) => ({
          name: item.track.name,
          artist: item.track.artists[0].name,
          album: item.track.album.name,
          playlistId: playlistId,
          uri: item.track.uri,
        }));
        resolve(tracks);
      } else if (this.status == 401) {
        refreshAccessToken();
        reject("Token expired");
      } else {
        reject(this.responseText);
      }
    });
  });
}
