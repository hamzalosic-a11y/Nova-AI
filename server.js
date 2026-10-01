import "dotenv/config";
import express from "express";
import OpenAI from "openai";

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || "gpt-5";

app.use(express.json({limit:"1mb"}));
app.use(express.static("public"));

app.get("/api/health", (req,res) => res.json({
  ok:true,
  aiConfigured:Boolean(String(process.env.OPENAI_API_KEY||"").trim()),
  model,
  sportsSource:"Sofascore",
  sofascoreConfigured:Boolean(String(process.env.SOFASCORE_API_KEY||"").trim())
}));

app.get("/api/test-ai", async (req,res) => {
  const key=String(process.env.OPENAI_API_KEY||"").trim();
  if(!key) return res.status(503).json({ok:false,error:"OPENAI_API_KEY is missing."});
  try {
    const client=new OpenAI({apiKey:key});
    const r=await client.responses.create({
      model,
      input:"Reply with exactly: NovaAI connection works."
    });
    res.json({ok:true,answer:r.output_text});
  } catch(e) {
    console.error(e);
    res.status(502).json({ok:false,error:e?.message||"OpenAI request failed.",status:e?.status||null,code:e?.code||null});
  }
});

app.post("/api/chat", async (req,res) => {
  const message=String(req.body?.message||"").trim();
  if(!message) return res.status(400).json({error:"Message is required."});
  const key=String(process.env.OPENAI_API_KEY||"").trim();
  if(!key) return res.status(503).json({
    error:"OPENAI_API_KEY is missing.",
    fix:"Create .env from .env.example, add your key, then restart NovaAI."
  });
  try {
    const client=new OpenAI({apiKey:key});
    const r=await client.responses.create({
      model,
      instructions:"You are NovaAI, a helpful concise AI assistant. Do not invent live sports scores; current scores are shown in the Sofascore panel.",
      input:message
    });
    res.json({answer:r.output_text});
  } catch(e) {
    console.error(e);
    res.status(502).json({
      error:"OpenAI request failed.",
      detail:e?.message||"Unknown error",
      status:e?.status||null,
      code:e?.code||null
    });
  }
});

app.get("/api/scores", async (req,res) => {
  const sport=["football","basketball","tennis"].includes(String(req.query.sport||"football").toLowerCase())
    ? String(req.query.sport||"football").toLowerCase() : "football";
  const date=new Date().toISOString().slice(0,10);
  const headers={"Accept":"application/json","User-Agent":"NovaAI/2.0"};
  const key=String(process.env.SOFASCORE_API_KEY||"").trim();
  if(key) headers.Authorization=`Bearer ${key}`;
  const url=`https://www.sofascore.com/api/v1/sport/${sport}/scheduled-events/${date}`;
  try {
    const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});
    if(!r.ok) throw new Error(`Sofascore HTTP ${r.status}`);
    const data=await r.json();
    const events=(data.events||[]).slice(0,100).map(e=>({
      id:e.id,
      tournament:e.tournament?.name||"Unknown",
      homeTeam:e.homeTeam?.name||"Home",
      awayTeam:e.awayTeam?.name||"Away",
      homeScore:e.homeScore?.current??null,
      awayScore:e.awayScore?.current??null,
      status:e.status?.description||e.status?.type||"Scheduled",
      startTimestamp:e.startTimestamp||null,
      link:e.id?`https://www.sofascore.com/event/${e.id}`:null
    }));
    res.json({ok:true,source:"Sofascore",sport,events,updatedAt:new Date().toISOString()});
  } catch(e) {
    console.error(e);
    res.status(502).json({ok:false,source:"Sofascore",error:e?.message||"Sofascore request failed."});
  }
});

app.use((req,res)=>{
  res.sendFile(new URL("./public/index.html",import.meta.url));
});

app.listen(port,()=>console.log(`NovaAI running at http://localhost:${port}`));