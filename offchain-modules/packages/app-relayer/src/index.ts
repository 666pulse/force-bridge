import 'reflect-metadata';
import { getFromEnv } from '@force-bridge/x/dist/utils';
import { startRelayer } from './relayer';

async function main(): Promise<void> {
  try{
    console.log("start relayer")
    const configPath = getFromEnv('CONFIG_PATH');
    await startRelayer(configPath);
  }catch (e) {
    console.log(e)
  }
}

void main();
