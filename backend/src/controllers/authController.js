import pool from '../db/index.js' ; 
import bcrypt from 'bcrypt' ; 
import { generateToken } from '../utils/jwt.js';

export async function register(req, res) {
    try{
        const {email , password , favoriteTeam} = req.body ; 

        //validate input
        if(!email || !password) {
            return res.status(400).json({
                success : false, 
                message : 'Email and password required'
            }); 
        }

        //Check if user already exists 
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1' , 
            [email]
        ); 

        if(existingUser.rows.length > 0){
            return res.status(400).json({
                success : false , 
                message : 'User Already Exists'
            }); 
        }

        //hash pw (10 rounds)
        const hashedPW = await bcrypt.hash(password , 10) ; 

        //create user 
        const result = await pool.query(
            `INSERT INTO users (email, password , favorite_team)
            VALUES ($1 , $2 , $3)
            RETURNING id, email, favorite_team` , 
            [email , hashedPW , favoriteTeam || null]
        ); 

        const user = result.rows[0] ; 
        const token = generateToken(user.id , user.email) ;

        res.status(201).json({
            success : true , 
            user : {
                id : user.id , 
                email : user.email , 
                favoriteTeam : user.favorite_team
            }, 
            token 
        }); 
    }catch(err){
        console.log('Registration error : ' , err) ; 
        res.status(500).json({
            success : false, 
            message : 'Server Error During Registration'
        }); 
    }
}

export async function login(req , res) {
    try{
        const {email , password} = req.body ; 

        //validate input
        if(!email || !password){
            return res.status(400).json({
                success : false , 
                message : 'Email and Password required'
            }) ; 
        }

        //Find the user
        const result = await pool.query(`
            SELECT id, email , password, favorite_team 
            FROM users 
            WHERE email = $1`, 
            [email]
        ); 

        if(result.rows.length === 0){
            return res.status(401).json({
                success : false, 
                message : 'Invalid Credentials'
            }); 
        }

        const user = result.rows[0] ; 

        //Valid Password
        const validPW = await bcrypt.compare(password , user.password); 

        if(!validPW){
            return res.status(401).json({
                success : false , 
                message : 'Invalid Credentials'
            }); 
        }

        const token = generateToken(user.id , user.email); 

        res.json({
            success : true , 
            user : {
                id : user.id , 
                email : user.email , 
                favoriteTeam : user.favorite_team 
            }, 
            token 
        }); 
    } catch(err){
        console.log('LOGIN ERROR : '  , err); 
        res.status(500).json({
            success : false, 
            message : 'Server Error During Login'
        }); 
    }
}