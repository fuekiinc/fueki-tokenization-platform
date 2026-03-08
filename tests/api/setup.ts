import { beforeAll } from 'vitest';

const BASE_URL = process.env.FUEKI_API_URL || 'https://fueki-backend-pojr5zp2oq-uc.a.run.app';
const API_PREFIX = process.env.FUEKI_API_PREFIX || '/api';
const EXPECT_CONTRACT_APIS = process.env.FUEKI_EXPECT_CONTRACT_APIS === 'true';
const EXPECT_COMPILE_STATUS = Number(process.env.FUEKI_EXPECT_COMPILE_STATUS || (EXPECT_CONTRACT_APIS ? 200 : 404));
const EXPECT_GAS_STATUS = Number(process.env.FUEKI_EXPECT_GAS_STATUS || (EXPECT_CONTRACT_APIS ? 200 : 404));

beforeAll(() => {
  if (!/^https?:\/\//.test(BASE_URL)) {
    throw new Error(`Invalid FUEKI_API_URL: ${BASE_URL}`);
  }
  if (!API_PREFIX.startsWith('/')) {
    throw new Error(`Invalid FUEKI_API_PREFIX: ${API_PREFIX}`);
  }
  if (!Number.isInteger(EXPECT_COMPILE_STATUS) || EXPECT_COMPILE_STATUS < 100 || EXPECT_COMPILE_STATUS > 599) {
    throw new Error(`Invalid FUEKI_EXPECT_COMPILE_STATUS: ${EXPECT_COMPILE_STATUS}`);
  }
  if (!Number.isInteger(EXPECT_GAS_STATUS) || EXPECT_GAS_STATUS < 100 || EXPECT_GAS_STATUS > 599) {
    throw new Error(`Invalid FUEKI_EXPECT_GAS_STATUS: ${EXPECT_GAS_STATUS}`);
  }
});

export {
  API_PREFIX,
  BASE_URL,
  EXPECT_COMPILE_STATUS,
  EXPECT_CONTRACT_APIS,
  EXPECT_GAS_STATUS,
};
