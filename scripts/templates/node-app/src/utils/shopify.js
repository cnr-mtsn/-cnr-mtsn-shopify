export const toGid = (type, id) => {
  return `gid://shopify/${type.charAt(0).toUpperCase() + type.slice(1)}/${id}`;
};
