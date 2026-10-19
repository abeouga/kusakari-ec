import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const api='http://127.0.0.1:18081/api';

test('thumbnail prefers newest saved image, falls back after deletion and rejects stale captures',async({page,request})=>{
 const garden=await request.post(api+'/gardens',{data:{name:'サムネイル検証-'+randomUUID().slice(0,8)}}).then(r=>r.json());
 const url=api+'/gardens/'+garden.id;
 try{
  const initial=await request.get(url+'/thumbnail');
  expect(initial.headers()['x-thumbnail-source']).toBe('layout');
  const dataUrl=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const ctx=c.getContext('2d');ctx.fillStyle='#c6d4b5';ctx.fillRect(0,0,600,400);return c.toDataURL();});
  const corners=[{x:0.1,y:0.9},{x:0.9,y:0.9},{x:0.9,y:0.1},{x:0.1,y:0.1}];
  const object={id:randomUUID(),assetId:'shrub_boxwood',position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}};
  const saved=await request.put(url,{data:{...garden,objects:[object],photo:{dataUrl,imageWidth:600,imageHeight:400,corners,boundary:corners}}}).then(r=>r.json());
  expect((await request.post(url+'/thumbnail',{data:{revision:garden.revision,dataUrl}})).status()).toBe(409);
  expect((await request.post(url+'/thumbnail',{data:{revision:saved.revision,dataUrl:'data:image/png;base64,bad'}})).status()).toBe(400);
  expect((await request.post(url+'/thumbnail',{data:{revision:saved.revision,dataUrl}})).status()).toBe(204);
  expect((await request.get(url+'/thumbnail')).headers()['x-thumbnail-source']).toBe('scene');
  // Controlled image-storage fixture; this test does not invoke a paid image-generation service.
  const payload={id:randomUUID(),document:saved,beforeDataUrl:dataUrl,afterDataUrl:dataUrl,model:'gpt-image-2.5-sunburst',quality:'medium',generationMethod:'full_frame_v1',inputImageCount:2,referenceSummary:[{assetId:'shrub_boxwood',productId:'thumbnail-fixture',productName:'Thumbnail storage fixture',source:'uploaded'}]};
  expect((await request.post(url+'/image-history',{data:payload})).status()).toBe(200);
  await page.goto('/cart#garden-shopping-lists');
  const row=page.getByTestId('garden-list-'+garden.id);
  const image=row.getByRole('img');
  await expect(image).toHaveAttribute('src',new RegExp('generated-'+payload.id));
  await expect.poll(()=>image.evaluate(i=>i.complete&&i.naturalWidth>0)).toBeTruthy();
  const second={...payload,id:randomUUID()};
  expect((await request.post(url+'/image-history',{data:second})).status()).toBe(200);
  await expect(image).toHaveAttribute('src',new RegExp('generated-'+second.id));
  const generated=await request.get(url+'/thumbnail');
  expect(generated.headers()['x-thumbnail-source']).toBe('generated');
  const proxy=await request.get('/api/shopping-lists/'+garden.id+'/thumbnail');
  expect(await proxy.body()).toEqual(await generated.body());
  await page.reload();
  await expect(image).toHaveAttribute('src',new RegExp('generated-'+second.id));
  await mkdir('artifacts/e2e/cart-ux',{recursive:true});
  await page.screenshot({path:'artifacts/e2e/cart-ux/generated-thumbnail.png',fullPage:true});
  await request.delete(url+'/image-history/'+second.id);
  await expect(image).toHaveAttribute('src',new RegExp('generated-'+payload.id));
  await request.delete(url+'/image-history/'+payload.id);
  await expect(image).toHaveAttribute('src',/scene-/);
  const updated=await request.put(url,{data:{...saved,name:saved.name+'更新'}}).then(r=>r.json());
  await expect(image).toHaveAttribute('src',/layout-/);
  expect((await request.get(url+'/thumbnail')).headers()['x-thumbnail-source']).toBe('layout');
  await writeFile('artifacts/e2e/cart-ux/thumbnail-lifecycle.json',JSON.stringify({gardenId:garden.id,revision:updated.revision,checks:['layout','scene','latest generated','previous generated','deleted fallback','revision fallback','invalid image','stale capture','proxy bytes','reload']},null,2));
 }finally{await request.delete(url);}
 expect((await request.get(url+'/thumbnail')).status()).toBe(404);
 expect((await request.get('/api/shopping-lists/'+garden.id+'/thumbnail')).status()).toBe(404);
});
