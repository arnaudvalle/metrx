import puppeteer from 'puppeteer';
import ora from 'ora';

import runMetricsExtracter from './src/runner.js';

import {
  DEFAULT_REPEAT_TIMES,
  DEFAULT_VIEWPORT_SIZE,
  DEFAULT_OUTPUT_FORMAT,
  OUTPUT_FORMATS,
  URL_REGEX,
} from './src/constants.js';

import output from './src/output.js';

export default async function start(
  {
    url,
    repeat = DEFAULT_REPEAT_TIMES,
    height = DEFAULT_VIEWPORT_SIZE.HEIGHT,
    width = DEFAULT_VIEWPORT_SIZE.WIDTH,
    outputFormat = DEFAULT_OUTPUT_FORMAT.DEFAULT,
    withRedirects = false,
    outputFile = false,
    customPath,
    waitUntil,
    headless = true,
    sandbox = true,
  },
  errorHandler,
) {
  // TODO: Make function to check options.
  if (url === undefined || !URL_REGEX.test(url)) {
    errorHandler(Error('Invalid URL'));
  }

  if (!OUTPUT_FORMATS.includes(outputFormat)) {
    errorHandler(Error('Unsupported output format'));
  }

  const spinner = ora('Launching Browser').start();

  const logStep = (step, repeat) => {
    spinner.text = `Extracting metrics ${step}/${repeat}`;
  };

  const logInfo = (log) => {
    spinner.text = log;
  };

  const browser = await puppeteer.launch({
    headless,
    args: sandbox ? undefined : ['--no-sandbox'],
  });

  const page = await browser.newPage();

  // Set the viewport.
  await page.setViewport({
    width: parseInt(width, 10),
    height: parseInt(height, 10),
  });

  try {
    let client;

    if (customPath) {
      const customPathFunction = await import(customPath);
      await customPathFunction.default(page, logInfo);
    }

    // If we want tu use a custom url, reach it before making metrics.
    logInfo(`Testing ${url}...`);

    await page.goto(url).catch(errorHandler);

    if (!client) {
      client = await page.target().createCDPSession();
      await client.send('Performance.enable');
    }

    const aggregatedData = await runMetricsExtracter({
      page,
      client,
      url,
      withRedirects,
      repeat,
      waitUntil,
      logStep,
    });

    spinner.stop();

    await browser.close();

    return output(aggregatedData, outputFormat, outputFile);
  } catch (error) {
    await browser.close();
    errorHandler(error);
  }
}
