import {createFileRoute,redirect} from "@tanstack/react-router";
export const Route=createFileRoute("/ai/assistant")({beforeLoad:()=>{throw redirect({to:"/",hash:"composer-answer",replace:true});}});
