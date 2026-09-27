// Optional browser verification: PLAYWRIGHT_MODULE may point to an existing installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = { '/': ['index.html','text/html'], '/game.js': ['game.js','text/javascript'], '/balance.js': ['balance.js','text/javascript'] };
const server = http.createServer((req,res) => {
  const file = files[req.url];
  if (!file) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type',file[1]); res.end(fs.readFileSync(path.join(root,file[0])));
});
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BIN || undefined});
  try {
    for (const device of [
      {name:'desktop',width:1920,height:1080,touch:false},
      {name:'notebook',width:1366,height:650,touch:false},
      {name:'notebook-short',width:1280,height:600,touch:false},
      {name:'phone',width:390,height:844,touch:true},
      {name:'phone-small',width:320,height:568,touch:true},
      {name:'phone-landscape',width:844,height:390,touch:true},
      {name:'tablet',width:900,height:1100,touch:true}
    ]) {
      const context=await browser.newContext({viewport:{width:device.width,height:device.height},hasTouch:device.touch,deviceScaleFactor:device.touch?2:1.25});
      const page=await context.newPage(); const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator('#tutorial').click();
      await page.locator('[data-tap="hard"]').isVisible().then(async visible => {
        if(visible) await page.locator('[data-tap="hard"]').click(); else await page.keyboard.press('Space');
      });
      await page.getByRole('heading',{name:'Escudo carregado!'}).waitFor();
      assert.equal(await page.locator('#shield').textContent(),'1/3');
      await page.locator('#action').click();
      await page.locator('#next span').first().waitFor();
      await page.locator('#pause').click();
      await page.getByRole('heading',{name:'Pausa',exact:true}).waitFor();
      await page.locator('#action').click();
      await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
      await page.getByRole('heading',{name:'Pausa',exact:true}).waitFor();
      await page.locator('#menu').click();
      await page.locator('#difficulty').selectOption('advanced');
      await page.locator('#action').click();
      await page.waitForFunction(()=>document.querySelector('#shield').textContent==='0/3');
      if(device.touch) assert.equal(await page.locator('.pad').isVisible(),true);
      if(device.name==='phone') {
        const pad=await page.locator('.pad').boundingBox();
        assert.ok(pad.y+pad.height<=device.height, 'Touch controls must fit without scrolling');
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),true, `${device.name}: page must fit vertically`);
      for(const selector of ['header','.stats','.powers','.preview-row','#field','#pause',...(device.touch?['.pad']:[])]) {
        const box=await page.locator(selector).boundingBox();
        assert.ok(box.y>=0 && box.y+box.height<=device.height+1,`${device.name}: ${selector} clipped`);
      }
      const field=await page.locator('#field').boundingBox();
      assert.ok(Math.abs(field.width/field.height-420/548)<.005,'Canvas proportions must remain unchanged');
      await page.screenshot({path:`/tmp/pdd-${device.name}.png`,fullPage:true});
      if(device.name==='notebook') {
        await page.setViewportSize({width:1093,height:520});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),true);
        const resized=await page.locator('#field').boundingBox();
        assert.ok(resized.y+resized.height<=520 && resized.width<field.width);
        await page.setViewportSize({width:device.width,height:device.height});
      }
      for(let i=0;i<60 && await page.locator('#overlay').isHidden();i++) {
        await page.keyboard.press('Space');
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      }
      await page.getByRole('heading',{name:'Tabuleiro bloqueado'}).waitFor();
      const downloadPromise=page.waitForEvent('download');
      await page.locator('#export').click();
      const download=await downloadPromise;
      const diagnostic=`/tmp/pdd-${device.name}-diagnostic.json`;
      await download.saveAs(diagnostic);
      execFileSync(process.execPath,[path.join(root,'scripts/replay.cjs'),diagnostic]);
      await page.locator('#same-seed').click();
      await page.waitForFunction(()=>document.querySelector('#overlay').hidden);
      assert.deepEqual(errors,[]);
      console.log(`${device.name}: tutorial, powers HUD, pause, auto-pause, difficulty, layout, exported replay and restart OK`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
