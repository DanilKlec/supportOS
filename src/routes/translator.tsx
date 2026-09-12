import {createFileRoute,redirect} from "@tanstack/react-router";
export const Route=createFileRoute("/translator")({beforeLoad:()=>{throw redirect({to:"/",hash:"composer-translate",replace:true});}});
