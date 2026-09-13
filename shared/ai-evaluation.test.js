import {expect,it} from 'vitest';
import {evaluateAIAnswer} from './ai-evaluation.js';
it('checks concepts without requiring an exact reference answer',()=>{
 expect(evaluateAIAnswer('Проверьте KYC перед выводом',{required:['kyc'],forbidden:['гарантируем']})).toEqual({passed:true,missing:[],forbidden:[]});
 expect(evaluateAIAnswer('Гарантируем выплату',{required:['KYC'],forbidden:['гарантируем']})).toEqual({passed:false,missing:['KYC'],forbidden:['гарантируем']});
});
