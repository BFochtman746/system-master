'use strict';
const fs=require('fs');
const path=require('path');
const {DatabaseSync,backup}=require('node:sqlite');
const {SecondShiftKernel}=require('./second-shift-kernel');

function closeQuietly(db){try{if(db&&db.isOpen)db.close();}catch(_){}}
function verifyDatabase(dbPath){
  const db=new DatabaseSync(dbPath,{open:false,readOnly:true,timeout:5000});
  try{
    db.open();
    const row=db.prepare('PRAGMA quick_check').get();
    const result=String(Object.values(row)[0]);
    if(result!=='ok')throw new Error(`DATABASE_INTEGRITY_FAILED:${result}`);
    const required=['work_items','events','outbox','authority_snapshots'];
    const rows=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const names=new Set(rows.map(r=>r.name));
    for(const name of required)if(!names.has(name))throw new Error(`DATABASE_SCHEMA_MISSING:${name}`);
    return {ok:true,quick_check:result};
  }finally{closeQuietly(db);}
}
function openVerifiedKernel(dbPath){
  if(fs.existsSync(dbPath))verifyDatabase(dbPath);
  return new SecondShiftKernel(dbPath);
}
async function backupKernel(kernel,backupPath){
  fs.mkdirSync(path.dirname(backupPath),{recursive:true});
  const pages=await backup(kernel.db,backupPath,{rate:64});
  const verification=verifyDatabase(backupPath);
  return {pages,backupPath,verification};
}
function restoreFromBackup(backupPath,targetPath){
  verifyDatabase(backupPath);
  const displaced=`${targetPath}.displaced-${Date.now()}`;
  for(const suffix of ['-wal','-shm']){try{fs.rmSync(`${targetPath}${suffix}`,{force:true});}catch(_){}}
  if(fs.existsSync(targetPath))fs.renameSync(targetPath,displaced);
  try{
    fs.copyFileSync(backupPath,targetPath);
    const verification=verifyDatabase(targetPath);
    return {targetPath,displaced:fs.existsSync(displaced)?displaced:null,verification};
  }catch(e){
    try{fs.rmSync(targetPath,{force:true});}catch(_){}
    if(fs.existsSync(displaced))fs.renameSync(displaced,targetPath);
    throw e;
  }
}
module.exports={verifyDatabase,openVerifiedKernel,backupKernel,restoreFromBackup};
