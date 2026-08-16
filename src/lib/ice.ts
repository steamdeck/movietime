export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [];
  const stun = process.env.NEXT_PUBLIC_STUN_SERVER?.trim();
  const turn = process.env.NEXT_PUBLIC_TURN_SERVER?.trim();
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME?.trim();
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL?.trim();

  servers.push({
    urls: stun || "stun:stun.l.google.com:19302",
  });

  if (turn && username && credential) {
    servers.push({
      urls: turn,
      username,
      credential,
    });
  }

  return servers;
}
