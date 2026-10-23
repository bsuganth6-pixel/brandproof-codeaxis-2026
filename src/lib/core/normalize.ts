/** Pure text normalisation shared by the server and the in-browser hash check. */
export const normalizeText = (t: string) => t.normalize('NFC').replace(/\r\n?/g, '\n').trim();
