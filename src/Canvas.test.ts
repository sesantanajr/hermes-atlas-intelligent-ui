import { describe, it, expect } from 'vitest';
import { calculate } from './Canvas';
describe('safe calculator',()=>{
 it('computes compound interest',()=>expect(calculate('compound',[1000,10,2])).toBeCloseTo(1210));
 it('does not divide by zero',()=>expect(calculate('split',[50,0])).toBeNull());
 it('handles overflow',()=>expect(calculate('compound',[1e12,1e12,1e12])).toBeNull());
 it('handles negative and fractional values',()=>expect(calculate('sum',[-2,0.5,3])).toBe(1.5));
 it('rejects unknown operations',()=>expect(calculate('eval',[1,2])).toBeNull());
 it('splits and multiplies',()=>{expect(calculate('split',[100,4])).toBe(25);expect(calculate('product',[2,3,4])).toBe(24);});
});
