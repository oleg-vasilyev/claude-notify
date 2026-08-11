const LABELLED_OR_PLAIN_PREFIX = /^\[([^\]@]+)[\]@]/;
const PLAIN_PREFIX = /^\[([^\]@]+)\]/;
const ANY_PREFIX = /^\[[^\]]*\]\s*/;
const UNSAFE_IN_A_FILE_NAME = /[^\w-]/g;
const PATH_SEPARATOR = /[\\/]/;

export const EVERY_PROJECT = "global";

export const projectKeyOf = (message: string): string => {
  const named = LABELLED_OR_PLAIN_PREFIX.exec(message);

  if (named?.[1] === undefined) {
    return EVERY_PROJECT;
  }

  return named[1].replace(UNSAFE_IN_A_FILE_NAME, "_");
};

export const withMachineLabel = (message: string, machineLabel: string): string => {
  if (machineLabel === "") {
    return message;
  }

  const plain = PLAIN_PREFIX.exec(message);

  if (plain?.[1] !== undefined) {
    return `[${plain[1]}@${machineLabel}]${message.slice(plain[0].length)}`;
  }

  if (message.startsWith("[")) {
    return message;
  }

  return `[${machineLabel}] ${message}`;
};

export const underProject = (message: string, projectPrefix: string): string =>
  projectPrefix === "" ? message : `${projectPrefix}${message.replace(ANY_PREFIX, "")}`;

export const projectPrefixOf = (workingDirectory: string | undefined): string => {
  if (workingDirectory === undefined || workingDirectory === "") {
    return "";
  }

  const segments = workingDirectory.split(PATH_SEPARATOR).filter((segment) => segment !== "");
  const project = segments[segments.length - 1];

  if (project === undefined) {
    return "";
  }

  return `[${project}] `;
};
