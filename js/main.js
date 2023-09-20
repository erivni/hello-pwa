const CONNECTING = "TRYING TO CONNECT"
const CONNECTED = "CONNECTED"
const DISCONNECTED = "DISCONNECT, PLEASE HOLD"
const FAILED_OR_CLOSED = "FAILURE. CHECK YOUR DEVICE."
const CONNECT_TIMEOUT = "FAILURE. CONNECT TIMEOUT."
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

  // elements
  const initial = document.querySelector('.f-screen')
  const remote = document.querySelector('.r-screen')
  const form = document.querySelector('form')
  const messagePanel = document.querySelector('.m-screen')
  const text = document.querySelector('#text')
  const spinner = document.querySelector('#spinner')
  const closeButton = document.querySelector('.footer > button')
  const sliderVolumeInput = document.querySelector('#slider-volume-input')
  const sliderVolumeOutput = document.querySelector('#slider-volume-output')

  let currentView = INITIAL
  let keyPressAudio = new Audio('./audio/press.wav');

  // functions

  const show = (ele) => {
    seamless.scrollIntoView(ele, { behavior: "smooth" });
    //ele.scrollIntoView({ behavior: "smooth" })
  }

  const hide = (ele) => {
    ele.classList.add('hidden')
  }

  const reveal = (ele) => {
    ele.classList.remove('hidden')
  }

  const clickEffect = (el, success) => {
    keyPressAudio.play();
    if (navigator && navigator.vibrate) {
      navigator.vibrate(70);
    }
    remote.classList.toggle('error', !success) // change the button press color when error happens
  }

  const updateView = (msg) => {
    switch (msg) {
      case INITIAL:
        hide(closeButton)
        show(initial)
        currentView = initial
        break;

      case CONNECTING:
      case DISCONNECTED:
        text.innerHTML = msg
        reveal(spinner)
        show(messagePanel)
        reveal(closeButton)
        currentView = messagePanel
        break;

      case CONNECTED:
        show(remote)
        currentView = remote
        break;

      case FAILED_OR_CLOSED:
        text.innerHTML = FAILED_OR_CLOSED
      case CONNECT_TIMEOUT:
        text.innerHTML = CONNECT_TIMEOUT
        hide(spinner)
        show(messagePanel)
        currentView = messagePanel
        break;
      default:
        console.log(`did not recognize message ${msg} to update the view by`)
        break;
    }
  }

  const connectToWebRTC = (deviceId, token, useStun, useDev, useLocal) => {
    updateView(CONNECTING)
    const messageBrokerServer = `https://hyperscale-message-broker-main.ingress.active${ useDev ? '.dev' : ''}.streaming.synamedia.com`
    let iceServersList = [];
    if (useStun) {
      iceServersList = [{ urls: 'stun:stun.l.google.com:19302' }]
    }
    peerConnection = new RTCPeerConnection({ iceServers: iceServersList });
    dataChannel = peerConnection.createDataChannel('hyperscale', { ordered: true, maxPacketLifeTime: 3000 });
    dataChannel.onopen = () => { console.log("data channel has opened"); }
    dataChannel.onclose = (e) => { console.log("data channel has closed"); }
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
      if (event.candidate != null) {
        return // ignore event until last candidate arrives..
      }

      const sendOffer = async (offer) => {
        try {
          let offerBody = {
            payload: {
              type: "pluginOffer",
              offer: offer
            },
            target: "transcontainer",
            origin: "internal",
            eventName: "pluginOffer",
          }

          const url = useLocal ? `http://localhost:9999/message` : `${messageBrokerServer}/message-broker/1.0/messages/devices/${deviceId}?wait=true`;
          if (useLocal) {
            offerBody.payload = JSON.stringify(offerBody.payload);
          }

          let sendOfferResponse = await fetch(url, {
            method: 'post',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': "Bearer " + token,
            },
            body: JSON.stringify(offerBody)
          })

          if (sendOfferResponse.status !== 200) {
            console.log(`error posting debug offer to message broker: ${sendOfferResponse.statusText}`)
            return;
          }

          const body = await sendOfferResponse.json()
          return body.payload ?? body;
        } catch (e) {
          console.log(`error sending debug offer: ${e.toString()}`)
          return;
        }
      };

      if (peerConnection && event.candidate === null) {
        let offer = Object.assign({}, peerConnection.localDescription.toJSON());
        offer.pluginType = "remote-control";
        offer.deviceId = deviceId;

        let answer = await sendOffer(offer);
        if (answer) {
            console.log(`got plugin id ${answer?.pluginId}. setting remote description`);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log("after setting remote description");
            return;
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
      e.preventDefault()
      try {
        dataChannel.send(msg)
        console.log(msg)
        clickEffect(b.parentElement, true);
      } catch (err) {
        console.error(`Failed to send message ${msg}, ${err.toString()}`);
        clickEffect(b.parentElement, false);
      }
    })
  })

  closeButton.addEventListener('click', (e) => {
    console.log({ peerConnection, dataChannel });
    if (peerConnection) {
      console.log("closing peer connection")
      peerConnection.close()
    }
    updateView(INITIAL)
  })

  // sliderVolumeInput.addEventListener('change', (e) => {
  //   e.preventDefault()
  //   const msg = JSON.stringify({ "type": "volume", "percent": parseInt(e.target.value) })
  //   try {
  //     dataChannel.send(msg)
  //   } catch (err) {
  //     console.error(`Failed to send message ${msg}, ${err.toString()}`);
  //   }
  // })
  // sliderVolumeInput.addEventListener('input', (e) => {
  //   e.preventDefault()
  //   sliderVolumeOutput.textContent = `${e.target.value}%`
  // })

  const deviceIdInput = document.querySelector('input#deviceId')
  let deviceIdStored = localStorage.getItem('deviceId')
  if (deviceIdStored) {
    deviceIdInput.value = deviceIdStored
  }
  const tokenInput = document.querySelector('input#token')
  let tokenStored = localStorage.getItem('token')
  if (tokenStored) {
    tokenInput.value = tokenStored
  }

  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const deviceId = deviceIdInput.value
      localStorage.setItem('deviceId', deviceId)
      const token = tokenInput.value
      localStorage.setItem('token', token)

      const useStun = document.querySelector('input#useStun').checked
      const useDev = document.querySelector('input#useDev').checked
      const useLocal = document.querySelector('input#useLocal').checked

      connectToWebRTC(deviceId, token, useStun, useDev, useLocal)
    }
  }

  screen.orientation.addEventListener('change', () => {
    show(currentView)
  })
}
