export const impossible = (value: never): never => {
  throw new Error(`a switch missed a case the type said could not exist: ${JSON.stringify(value)}`);
};
