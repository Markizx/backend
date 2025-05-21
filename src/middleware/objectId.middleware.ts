import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ApiResponse } from '@utils/response';

export const validateObjectId = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.params[paramName];
    
    if (!id) {
      return ApiResponse.sendError(res, 'Не указан ID объекта', null, 400);
    }
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return ApiResponse.sendError(
        res, 
        'Некорректный формат ID', 
        {
          details: `Параметр ${paramName} не является корректным MongoDB ObjectId`
        },
        400
      );
    }
    
    next();
  };
};