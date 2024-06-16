const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Token = require("../models/tokenModel");
const crypto = require("crypto");


const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" })
};

// Register user
const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body

    // Validation
    if (!name || !email || !password) {
        res.status(400)
        throw new Error("Please fill all the required fields")
    }
    if (password.length < 6) {
        res.status(400)
        throw new Error("Password must be atleast of 6 characters")
    }

    //Check if email already exist in database
    const userExists = await User.findOne({ email })

    if (userExists) {
        res.status(400)
        throw new Error("Email already registered")
    }


    //Create new user in our database
    const user = await User.create({
        name,
        email,
        password,
    })

    if (user) {
        //Generate token
        const token = generateToken(user._id)

        //Send HTTP-only cookie
        res.cookie("token", token, {
            path: "/",
            httpOnly: true,
            expires: new Date(Date.now() + 1000 * 86400), //1 day
            sameSite: "none",
            secure: true,
        })
        const { _id, name, email, photo, phone, bio } = user;

        return res.status(201).json({
            _id, name, email, photo, phone, bio, token,
        })
    } else {
        res.status(400)
        throw new Error("Invalid user data")
    }
});

//Login user
const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body

    //Validation of request
    if (!email || !password) {
        res.status(400);
        throw new Error("Please enter email and password");
    }

    //Check if user exists
    const user = await User.findOne({ email })

    if (!user) {
        res.status(400);
        throw new Error("User not found");
    }

    // User exists now checking password is correct or not
    const passwordIsCorrect = await bcrypt.compare(password, user.password)

    //Generate token
    const token = generateToken(user._id)

    //Send HTTP-only cookie
    res.cookie("token", token, {
        path: "/",
        httpOnly: true,
        expires: new Date(Date.now() + 1000 * 86400), //1 day
        sameSite: "none",
        secure: true,
    });

    if (user && passwordIsCorrect) {
        const { _id, name, email, photo, phone, bio } = user;
        res.status(200).json({
            _id, name, email, photo, phone, bio, token,
        });
    } else {
        res.status(400);
        throw new Error("Invalid email or password");
    }
});

//Logout User
const logout = asyncHandler(async (req, res) => {
    res.cookie("token", "", {
        path: "/",
        httpOnly: true,
        expires: new Date(0), //expiring cookie will logout the user
        sameSite: "none",
        secure: true,
    });
    return res.status(200).json({ message: "Logged out successfully" });
});

//Get user data
const getUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)

    if (user) {
        const { _id, name, email, photo, phone, bio } = user;
        res.status(200).json({
            _id, name, email, photo, phone, bio,
        })
    } else {
        res.status(400);
        throw new Error("User not found")
    }
});

//Get login status
const loginStatus = asyncHandler(async (req, res) => {
    const token = req.cookies.token;
    if (!token) {
        return res.json(false);
    }

    //Verify token
    const verified = jwt.verify(token, process.env.JWT_SECRET)
    if (verified) {
        return res.json(true);
    }
    return res.json(false);
});

//Update user
const updateUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        const { name, email, photo, phone, bio } = user;
        user.email = email;
        user.name = req.body.name || name;
        user.phone = req.body.phone || phone;
        user.bio = req.body.bio || bio;
        user.photo = req.body.photo || photo;

        const updatedUser = await user.save();
        res.status(200).json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            photo: updatedUser.photo,
            phone: updatedUser.phone,
            bio: updatedUser.bio,
        })
    } else {
        res.status(404)
        throw new Error("User not found")
    }
});

//Change Password
const changePassword = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    const { oldPassword, password } = req.body

    if (!user) {
        res.status(400);
        throw new Error("User not found, please signup");
    }
    //Validate
    if (!oldPassword || !password) {
        res.status(400);
        throw new Error("Please add old and new password");
    }

    //Check if old password is same as in DB
    const passwordIsCorrect = await bcrypt.compare(oldPassword, user.password)

    // save new password
    if (user && passwordIsCorrect) {
        user.password = password
        await user.save()
        res.status(200).send("Password changed successfully")
    } else {
        res.status(400);
        throw new Error("Old password is not correct");
    }

});

//Forgot Password
const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body
    const user = await User.findOne({ email })

    if (!user) {
        res.status(404);
        throw new Error("User does not exist");
    }

    //Delete token if it exist
    let token = await Token.findOne({ userId: user._id })
    if (token) {
        await token.deleteOne()
    }

    // Create Reset token
    let resetToken = crypto.randomBytes(32).toString("hex") + user._id


    //Hash token before saving to DB
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex")

    //Save token to DB
    await new Token({
        userId: user._id,
        token: hashedToken,
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * (60 * 1000) //30 min
    }).save()

    //construct reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/resetpassword/${resetToken}`

    //Reset email
    const message = `
   <h2>Hello ${user.name}</h2>
   <p>Please use the url below to reset your password.</p>
   <p>This link is valid for 30 minutes only.</p>

   <a href=${resetUrl} clicktracking=off>${resetUrl}</a>

   <p>Regards. </p>
   <p>Ananmay </p>
   `;

    const subject = "Password reset Request"
    const send_to = user.email
    const sent_from = precess.env.EMAIL_USER

    try {
        await sendEmail(subject, message, send_to, sent_from)
        res.status(200).json({ success: true, message: "Reset email sent to the given email" })
    } catch (err) {
        res.status(500)
        throw new Error("Email not sent. Please try again")
    }

});

//Resset password
const resetPassword = asyncHandler(async (req, res) => {
    const { password } = req.body
    const { resetToken } = req.params

    //Hash token, then compare to that one in the DB
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex")

    //Find token in DB
    const userToken = await Token.findOne({
        token: hashedToken,
        expiresAt: { $gt: Date.now() }
    })

    if (!userToken) {
        res.status(404);
        throw new Error("Invalid or Expired token");
    }

    //Find user
    const user = await User.findOne({ _id: userToken.userId })
    user.password = password
    await user.save()
    res.status(200).json({
        message: "Password Reset Successful. Please login."
    });

});

module.exports = {
    registerUser,
    loginUser,
    logout,
    getUser,
    loginStatus,
    updateUser,
    changePassword,
    forgotPassword,
    resetPassword,
};