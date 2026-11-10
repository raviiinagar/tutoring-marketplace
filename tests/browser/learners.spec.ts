import { openLearningTools } from "./navigation";
import {test,expect,type Page} from '@playwright/test';
const password='Fictional-profile-password-321!';
async function signup(page:Page,email:string){
  await page.goto('/auth/signup');await page.getByLabel('Your name', { exact: true }).fill('Fictional adult');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
  const registered=page.waitForResponse(r=>r.url().endsWith('/v1/auth/registrations')&&r.request().method()==='POST');await page.getByRole('button',{name:'Create account',exact:true}).click();expect((await registered).status()).toBe(202);
  await page.getByRole('link',{name:'Open captured email inbox'}).click();await page.getByRole('listitem').filter({hasText:email}).getByRole('link',{name:'Open verification link'}).click();await page.getByRole('button',{name:'Verify email',exact:true}).click();await expect(page.getByRole('heading',{name:'Email verified',exact:true})).toBeVisible();
  await page.goto('/auth/signin');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
  const login=page.waitForResponse(r=>r.url().endsWith('/v1/auth/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'Sign in',exact:true}).click();expect((await login).status()).toBe(200);await expect(page.getByRole('heading',{name: 'Dashboard',exact:true})).toBeVisible();
}
// ADR 0015: one adult Learner profile per account; a parent books for their child
// from it. Child profiles and Guardian reviews are retired.
test('a parent uses their own adult profile; child profiles and Guardian reviews are retired',async({page})=>{
  test.setTimeout(180_000);const ownerEmail=`parent-${Date.now()}@example.test`;
  await signup(page,ownerEmail);await openLearningTools(page);await page.getByRole('link',{name:'Learner profiles',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Create your Learner profile',exact:true})).toBeVisible();
  await expect(page.getByText(/Booking classes for your child\? Use your own profile/)).toBeVisible();
  await expect(page.getByRole('checkbox',{name:/child profile/i})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Guardian verification'})).toHaveCount(0);
  await page.getByLabel('Learner alias', { exact: true }).fill('Fictional parent');await page.getByLabel('Learning requirements', { exact: true }).fill('Class 9 Mathematics practice for my child');await page.getByRole('checkbox',{name:'I confirm this is my own profile and I am aged 18 or older',exact:true}).check();
  const adultCreated=page.waitForResponse(r=>r.url().endsWith('/v1/me/learners/adult')&&r.request().method()==='POST');await page.getByRole('button',{name:'Create profile',exact:true}).click();expect((await adultCreated).status()).toBe(201);
  await expect(page.getByRole('heading',{name:'Fictional parent',exact:true})).toBeVisible();await expect(page.getByText('Ready for tutoring',{exact:true})).toBeVisible();
  const origin=process.env.PLAYWRIGHT_BASE_URL||'http://localhost:3100';
  expect((await page.request.post('/v1/me/learners/children',{headers:{Origin:origin},data:{}})).status()).toBe(410);
  await page.goto('/staff/guardians');await expect(page.getByText(/Child profiles and Guardian verification are no longer offered/)).toBeVisible();
});
