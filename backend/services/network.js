export function isPrivateIPv4(value) {
  if (typeof value !== 'string') return false;
  const octets = value.split('.');
  if (octets.length !== 4 || octets.some(part => !/^\d{1,3}$/.test(part))) return false;
  const numbers = octets.map(Number);
  if (numbers.some(number => number < 0 || number > 255)) return false;
  const [a, b] = numbers;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function validatePorts(ports) {
  return Array.isArray(ports) && ports.length > 0 &&
    ports.every(port => Number.isInteger(Number(port)) && Number(port) >= 1 && Number(port) <= 65535);
}
