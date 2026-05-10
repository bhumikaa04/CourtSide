import jwt, { decode } from 'jsonwebtoken' ; 
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET_KEY ; 

export function generateToken(userId , email){
    //Create token that expires in 7 days 
    return jwt.sign(
        {userId , email} ,  //Payload
        process.env.JWT_SECRET_KEY ,        //Secret key 
        {expiresIn : '7d'}  //Options
    ); 
}

export function verifyToken(token){
    try{
        const decoded = jwt.verify(token , JWT_SECRET); 
        return decoded ; 
    }catch(err){
        //Token is invalid or expired
        return null;
    }
}