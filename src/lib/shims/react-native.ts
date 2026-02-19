export const Platform = {
  OS: "web",
  select: <T>(options: { web?: T; default?: T }) => options.web ?? options.default,
};

export default {};
