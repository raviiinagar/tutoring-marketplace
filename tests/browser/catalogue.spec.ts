import {test,expect} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {totp} from '../../apps/api/src/totp';

const execute=promisify(execFile);
async function operator(command:'grant'|'revoke',email:string){
  await execute(process.execPath,['--env-file=.local/browser-tests.env','node_modules/tsx/dist/cli.mjs','--tsconfig','apps/api/tsconfig.json','apps/api/src/staff-operator.ts',command,'--email',email,'--environment','development','--reason','Isolated browser fixture access',...(command==='grant'?['--scopes','TRUST']:[])],{timeout:30_000});
}
test('public catalogue aliases and Trust maintenance stay consistent',async({page})=>{
  test.setTimeout(180_000);const email=`catalogue-browser-${Date.now()}@example.test`;const password='Catalogue-browser-password-321!';let granted=false;
  try{
    await page.goto('/auth/signup');await page.getByLabel('Your name').fill('Browser Operator');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
    const registered=page.waitForResponse(r=>r.url().endsWith('/v1/auth/registrations')&&r.request().method()==='POST');await page.getByRole('button',{name:'Create account',exact:true}).click();expect((await registered).status()).toBe(202);
    await page.getByRole('link',{name:'Open captured email inbox'}).click();await page.getByRole('listitem').filter({hasText:email}).getByRole('link',{name:'Open verification link'}).click();await page.getByRole('button',{name:'Verify email',exact:true}).click();await expect(page.getByRole('heading',{name:'Email verified',exact:true})).toBeVisible();
    await operator('grant',email);granted=true;
    await page.goto('/auth/signin');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
    const login=page.waitForResponse(r=>r.url().endsWith('/v1/auth/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'Sign in',exact:true}).click();expect((await login).status()).toBe(200);
    await page.getByRole('link',{name:'Open staff console'}).click();await expect(page.getByRole('heading',{name:'Set up staff MFA',exact:true})).toBeVisible();
    await page.getByLabel('Account password').fill(password);await page.getByRole('button',{name:'Create authenticator setup',exact:true}).click();
    const secret=await page.getByLabel('Authenticator setup key').textContent();await page.getByLabel('Authenticator code').fill(totp(secret!.trim(),new Date()));await page.getByRole('button',{name:'Confirm MFA',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Save your recovery codes',exact:true})).toBeVisible();
await page.getByRole('button',{name:'I saved my recovery codes',exact:true}).click();
    await page.getByRole('link',{name:'Manage learning catalogue'}).click();
    await expect(page.getByRole('heading',{name:'Catalogue administration',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Add catalogue term',exact:true}).click();
    const suffix=Date.now();const label=`Browser topic ${suffix}`;
    await page.getByLabel('Stable identifier').fill(`subject-browser-${suffix}`);
    await page.getByLabel('Display label').fill(label);
    await page.getByLabel('Aliases',{exact:true}).fill(`Browser alias ${suffix}`);
    await page.getByLabel('Career skills',{exact:true}).check();
    await page.getByLabel('Reason for catalogue change').fill('Verify public catalogue maintenance');
    await page.getByRole('button',{name:'Save catalogue term',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Catalogue term saved');
    await page.goto('/');
    const domains=page.locator('#subjects');await expect(domains.locator('[data-domain]')).toHaveCount(8);
    await page.getByLabel('Search learning domains').fill('IIT-JEE');await page.getByRole('button',{name:'Explore',exact:true}).click();
    await expect(domains.getByRole('button',{name:/Entrance examinations/})).toBeVisible();
    await domains.getByRole('button',{name:/Entrance examinations/}).click();
    const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Exam tracks',exact:true})).toBeVisible();await expect(dialog.getByText('NEET',{exact:true})).toBeVisible();await expect(dialog.getByText('CUET',{exact:true})).toBeVisible();await expect(dialog.getByText('Physics',{exact:true})).toBeVisible();await expect(dialog.getByText('Hindi',{exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByLabel('Search learning domains').fill(`Browser alias ${suffix}`);await page.getByRole('button',{name:'Explore',exact:true}).click();
    await domains.getByRole('button',{name:/Career skills/}).click();await expect(dialog.getByText(label,{exact:true})).toBeVisible();await page.keyboard.press('Escape');
    await page.goto('/staff/catalogue');await page.getByRole('button',{name:`Edit ${label} SUBJECT`,exact:true}).click();
    await expect(page.getByLabel('Stable identifier')).toBeDisabled();await page.getByLabel('Active in public catalogue').uncheck();await page.getByLabel('Reason for catalogue change').fill('Deactivate browser fixture subject');await page.getByRole('button',{name:'Save catalogue term',exact:true}).click();await expect(page.getByRole('status')).toContainText('Catalogue term saved');
    await page.goto('/');await page.getByLabel('Search learning domains').fill(`Browser alias ${suffix}`);await page.getByRole('button',{name:'Explore',exact:true}).click();await expect(domains).toContainText('No matching learning domains');
  }finally{if(granted)await operator('revoke',email);}
});
