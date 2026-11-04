/* Shared PeerJS options for the teacher hub and student page.
   PeerJS's default TURN hosts (eu-0.turn.peerjs.com and us-0.turn.peerjs.com)
   no longer resolve. A custom config replaces those defaults, so dead relays
   are left out — a school DNS server can stall for a long time on them and the
   chat line never opens. STUN on port 443 is included because many school
   firewalls block the usual STUN port (19302) but still allow 443. */
(function (root) {
  var iceServers = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: ["stun:webrtc.homeway.io:443", "stun:webrtc.homeway.io:3478"] }
  ];

  function peerOptions() {
    return {
      debug: 0,
      config: {
        iceServers: iceServers,
        sdpSemantics: "unified-plan"
      }
    };
  }

  root.IgcNet = { iceServers: iceServers, peerOptions: peerOptions };
})(typeof window !== "undefined" ? window : globalThis);
