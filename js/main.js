window.onload = () => {
  'use strict';

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
             .register('./sw.js');
  }
}

let signallingServer = "http://signaling.hyperscale.coldsnow.net:9090";
let appManagerServer = "http://app.hyperscale.coldsnow.net:9091";
let tenant = "hyperscale-stackpath-prod";
let pc = null;
let sendChannel = null;

function onConnectClick() {
  let deviceId = document.getElementById("deviceId").value;
  if (deviceId === "") {
    alert("please enter deviceId to connect to");
    return;
  }

  pc = new RTCPeerConnection({
    iceServers: [
      {
        urls: 'stun:stun.l.google.com:19302'
      }
    ]
  })

  sendChannel = pc.createDataChannel('hyperscale', {
    ordered: true, // do not guarantee order
    maxPacketLifeTime: 3000, // in milliseconds
  });
  sendChannel.onclose = () => console.log('sendChannel has closed');
  sendChannel.onopen = () => console.log('sendChannel has opened');
  sendChannel.onmessage = e => console.log(`message from datachannel '${sendChannel.label}' payload '${e.data}'`)

  pc.oniceconnectionstatechange = e => {
    console.log(pc.iceConnectionState);
    if (pc.iceConnectionState == "connected"){
      let control = document.getElementById("control");
      control.hidden = false;
    }
  }

  pc.onicecandidate = async event => {
    if (event.candidate === null) {
      let deviceId = document.getElementById("deviceId").value;
      let offer = Object.assign({}, pc.localDescription.toJSON());
      offer.deviceId = deviceId;

      console.log("candidates complete, sending offer")
      let connectionId = await sendOffer(offer);
      if (connectionId !== null) {
        getAnswer(connectionId);
      }
    }
  }

  console.log("creating offer");
  // Offer to receive 1 audio, and 2 video track
  pc.addTransceiver('video', { 'direction': 'sendrecv' })
  pc.addTransceiver('video', { 'direction': 'sendrecv' })
  pc.addTransceiver('audio', { 'direction': 'sendrecv' })

  pc.createOffer().then(d => {
      console.log("finished creating offer. setting local description");
      pc.setLocalDescription(d);
      console.log("finished setting local description. collecting ice candidates...");
    }
  ).catch(console.log);

}

async function sendOffer(offer) {
  try {
    console.log("about to send debug offer");

    let deviceId = document.getElementById("deviceId").value;
    let connectionId = null;

    // get connectionId by deviceId
    let response = await fetch(`${signallingServer}/signaling/1.0/connections?deviceId=${deviceId}`, {
      method: 'get',
      headers: {
        'Accept': 'application/json',
        'x-hyperscale-tenant-name': tenant
      }
    });

    let body = await response.text();

    if (response.ok && body != "") {
      connectionId = JSON.parse(body).connectionId;
    }

    console.log("got connectionId " + connectionId + " from device id " + deviceId);

    // send offer to signalling server
    let sendOfferResponse = await fetch(`${signallingServer}/signaling/1.0/connections/${connectionId}/debug-offer`, {
      method: 'put',
      headers: {
        'Content-Type': 'application/json',
        'x-hyperscale-tenant-name': tenant
      },
      body: JSON.stringify(offer)
    })

    if (sendOfferResponse.status != 201) {
      console.log("error putting debug offer: " + response.statusText)
      return null;
    }

    console.log("finished posting debug offer. got connectionId");
    return connectionId;
  } catch (e) {
    console.log("error sending debug offer: " + e.toString())
    return null;
  }
}

async function getAnswer(connectionId) {
  try {
    console.log(`trying to get connection ${connectionId} debug answer..`);

    let response = await fetch(`${signallingServer}/signaling/1.0/connections/${connectionId}/debug-answer`, {
      method: 'get',
      headers: {
        'x-hyperscale-tenant-name': tenant
      }
    })

    let body = await response.text();

    if (response.ok && body != "") {
      console.log("got answer for connectionId " + connectionId + ". setting remote description");
      //document.getElementById('remoteSessionDescription').value = body
      await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(body)))
      return;
    }

    setTimeout(() => getAnswer(connectionId), 1000)

  } catch (e) {
    alert(e);
  }
}

