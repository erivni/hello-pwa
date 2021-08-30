const CONNECTING = "TRYING TO CONNECT"
const CONNECTED = "CONNECTED"
const DISCONNECTED = "DISCONNECT, PLEASE HOLD"
const FAILED_OR_CLOSED = "FAILURE. CHECK YOUR DEVICE."
const INITIAL = ""

window.onload = () => {
  // pwa
  'use strict';

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js');
  }

  // connection
  let peerConnection = null
  let dataChannel = null
  let answerTimeout = null

  // elements
  const initial = document.querySelector('.f-screen')
  const remote = document.querySelector('.r-screen')
  const form = document.querySelector('form')
  const messagePanel = document.querySelector('.m-screen')
  const text = document.querySelector('#text')
  const spinner = document.querySelector('#spinner')
  const closeButton = document.querySelector('.footer > button')

  // functions

  const show = (ele) => {
    ele.scrollIntoView({ behavior: "smooth" })
  }

  const hide = (ele) => {
    ele.classList.add('hidden')
  }

  const reveal = (ele) => {
    ele.classList.remove('hidden')
  }

  const updateView = (msg) => {
    switch (msg) {
      case INITIAL:
        hide(closeButton)
        show(initial)
        break;

      case CONNECTING:
      case DISCONNECTED:
        text.innerHTML = msg
        reveal(spinner)
        show(messagePanel)
        reveal(closeButton)
        break;

      case CONNECTED:
        show(remote)
        break;

      case FAILED_OR_CLOSED:
        text.innerHTML = FAILED_OR_CLOSED
        hide(spinner)
        show(messagePanel)
        break;
      default:
        console.log(`did not recognize message ${msg} to update the view by`)
        break;
    }
  }

  const connectToWebRTC = (deviceId) => {
    updateView(CONNECTING)
    const signalingServer = "http://signaling.hyperscale.coldsnow.net:9090"
    peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    dataChannel = peerConnection.createDataChannel('hyperscale', { ordered: true, maxPacketLifeTime: 3000 });
    dataChannel.onopen = () => { console.log("data channel has opened"); }
    dataChannel.onclose = (e) => { console.log("data channel has closed"); }
    peerConnection.addTransceiver('video', { 'direction': 'sendrecv' })
    peerConnection.addTransceiver('video', { 'direction': 'sendrecv' })
    peerConnection.addTransceiver('audio', { 'direction': 'sendrecv' })
    peerConnection.onconnectionstatechange = (e) => {
      console.log(`connection state changed to ${peerConnection.connectionState}`)
      switch (peerConnection.connectionState) {
        case "connected":
          updateView(CONNECTED)
          break;
        case "disconnected":
          updateView(DISCONNECTED)
          break;
        case "failed":
        case "closed":
          updateView(FAILED_OR_CLOSED)
          break;
      }
    }

    peerConnection.onicecandidate = async (event) => {
      const sendOffer = async (offer) => {
        try {
          let connectionId;
          // get connectionId by deviceId
          let response = await fetch(`${signalingServer}/signaling/1.0/connections?deviceId=${deviceId}`, { method: 'get', headers: { 'Accept': 'application/json' } });
          let body = await response.text();
          if (body !== "") {
            let jsonBody = JSON.parse(body);
            if (jsonBody.error) {
              console.log(`failed to get connection id for device ${deviceId}: ${body}`);
              return;
            }
            connectionId = JSON.parse(body).connectionId;
          }
          console.log(`got connectionId ${connectionId} from device id ${deviceId}`);

          // send offer to signaling server
          let sendOfferResponse = await fetch(`${signalingServer}/signaling/1.0/connections/${connectionId}/debug-offer`, {
            method: 'put',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(offer)
          })

          if (sendOfferResponse.status !== 201) {
            console.log(`error putting debug offer: ${response.statusText}`)
            return;
          }

          body = await sendOfferResponse.text()

          console.log(`finished posting debug offer. response: ${sendOfferResponse.status} ${body}`);
          return connectionId;
        } catch (e) {
          console.log(`error sending debug offer: ${e.toString()}`)
          return;
        }

      }
      const getAnswer = async (connectionId) => {
        try {
          console.log("trying to get answer..");
          let response = await fetch(`${signalingServer}/signaling/1.0/connections/${connectionId}/debug-answer`, { method: 'get' })
          let body = await response.text();
          if (response.ok && body !== "") {
            console.log(`got answer for connectionId ${connectionId}. setting remote description`);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(body)));
            console.log("after setting remote description");
            clearTimeout(answerTimeout)
            return;
          }
          console.log(`failed to get answer error: ${response.status}, ${body}`)
          // if failed to get positive response, try again in a second
          answerTimeout = setTimeout(() => getAnswer(connectionId), 1000)
        } catch (e) {
          this.console.log(`getAnswer error: ${e}`)
        }
      }

      if (peerConnection && event.candidate === null) {
        let offer = Object.assign({}, peerConnection.localDescription.toJSON());
        offer.deviceId = deviceId;
        let connectionId = await sendOffer(offer);
        if (connectionId) {
          console.log("starting to wait for answer");
          getAnswer(connectionId)
        }
      }
    }
    peerConnection.createOffer().then(d => peerConnection.setLocalDescription(d)).catch(e => console.error(e));
  }

  // event listeners

  const buttons = document.querySelectorAll('.button > button')
  buttons.forEach((b) => {
    const buttonId = b.getAttribute('id')
    const msg = `KEY_${buttonId.toUpperCase()}`
    b.addEventListener('click', (e) => {
      console.log(msg)
      dataChannel.send(msg)
    })
  })

  closeButton.addEventListener('click', (e) => {
    console.log({ peerConnection, dataChannel, answerTimeout });
    if (peerConnection) {
      console.log("closing peer connection")
      peerConnection.close()
    }
    if (answerTimeout) {
      clearTimeout(answerTimeout)
    }
    updateView(INITIAL)
  })

  const deviceIdInput = document.querySelector('input#deviceId')
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const deviceId = deviceIdInput.value
      connectToWebRTC(deviceId)
    }
  }
}
