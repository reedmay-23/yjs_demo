export const urlParamsHandle = (req: any): any => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  return url.searchParams;
};
