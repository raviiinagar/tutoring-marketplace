import {PublicTeacherMissing} from '@/components/public-pages';
import {createFileRoute,redirect} from '@tanstack/react-router';
import {api} from '@/lib/api';
import {requirePublic} from '@/lib/public-pages';
export const Route=createFileRoute('/tutors_/$listingId')({notFoundComponent:PublicTeacherMissing,loader:async({params})=>{const page=requirePublic(await api.publicTeacher(params.listingId));throw redirect({href:page.seo.path,statusCode:301});}});
