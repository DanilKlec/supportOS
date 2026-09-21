import { expect, it } from 'vitest';
import { evaluateAIAnswer } from './ai-evaluation.js';
it('checks required and forbidden concepts ignoring case', () => {
 expect(evaluateAIAnswer('Проверьте KYC перед выводом',{required:['kyc'],forbidden:['гарантируем']})).toMatchObject({passed:true,missing:[],forbidden:[]});
 expect(evaluateAIAnswer('Гарантируем выплату',{required:['KYC'],forbidden:['гарантируем']})).toMatchObject({passed:false,missing:['KYC'],forbidden:['гарантируем']});
});
it('never passes an empty response or a test without assertions', () => {
 expect(evaluateAIAnswer('',{forbidden:['promise']})).toMatchObject({passed:false,empty:true});
 expect(evaluateAIAnswer('Anything',{required:['  '],forbidden:[]})).toMatchObject({passed:false,configured:false});
});
