import type { ReactNode } from 'react';
import './styles.css';
export const metadata={title:'Tutor Marketplace | Account',description:'Local account integration harness'};
export default function Layout({children}:{children:ReactNode}) {
  return <html lang="en"><body><header><a href="/">Tutor Marketplace</a><span>Account integration preview</span></header><main>{children}</main><footer>Tuition is paid directly to tutors. Platform connections will be added in later tasks.</footer></body></html>;
}
