const express = require('express');
const bodyParser = require('body-parser');
const passport = require('passport');
const authJwtController = require('./auth_jwt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const User = require('./Users');
const Movie = require('./Movies');
const Review = require('./Reviews');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(passport.initialize());

const router = express.Router();

router.post('/signup', function(req, res) {
  if (!req.body.username || !req.body.password) {
    res.json({ success: false, msg: 'Please include both username and password to signup.' });
  } else {
    const user = new User();
    user.name = req.body.name;
    user.username = req.body.username;
    user.password = req.body.password;

    user.save(function(err) {
      if (err) {
        if (err.code == 11000)
          return res.json({ success: false, message: 'A user with that username already exists.' });
        else
          return res.json(err);
      }

      res.json({ success: true, msg: 'Successfully created new user.' });
    });
  }
});

router.post('/signin', function(req, res) {
  const userNew = new User();
  userNew.username = req.body.username;
  userNew.password = req.body.password;

  User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
    if (err) {
      res.send(err);
    }

    user.comparePassword(userNew.password, function(isMatch) {
      if (isMatch) {
        const userToken = { id: user.id, username: user.username };
        const token = jwt.sign(userToken, process.env.SECRET_KEY);
        res.json({ success: true, token: 'JWT ' + token });
      } else {
        res.status(401).send({ success: false, msg: 'Authentication failed.' });
      }
    });
  });
});

router.get('/movies', authJwtController.isAuthenticated, async (req, res) => {
  try {
    const aggregate = [
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'movieId',
          as: 'movieReviews'
        }
      },
      {
        $addFields: {
          avgRating: { $avg: '$movieReviews.rating' }
        }
      },
      {
        $sort: { avgRating: -1 }
      }
    ];

    const movies = await Movie.aggregate(aggregate).exec();
    res.status(200).json(movies);
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', error });
  }
});

router.get('/movies/:id', authJwtController.isAuthenticated, async (req, res) => {
  const movieId = req.params.id;

  try {
    const aggregate = [
      { $match: { _id: mongoose.Types.ObjectId(movieId) } },
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'movieId',
          as: 'movieReviews'
        }
      },
      {
        $addFields: {
          avgRating: { $avg: '$movieReviews.rating' }
        }
      }
    ];

    const movieDetails = await Movie.aggregate(aggregate).exec();
    if (movieDetails.length === 0) {
      return res.status(404).json({ message: 'Movie not found' });
    }

    res.status(200).json(movieDetails[0]);
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', error });
  }
});

router.post('/movies/search', authJwtController.isAuthenticated, async (req, res) => {
  const { query } = req.body;

  try {
    const aggregate = [
      {
        $match: {
          $or: [
            { title: { $regex: query, $options: 'i' } },
            { actors: { $elemMatch: { $regex: query, $options: 'i' } } }
          ]
        }
      },
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'movieId',
          as: 'movieReviews'
        }
      },
      {
        $addFields: {
          avgRating: { $avg: '$movieReviews.rating' }
        }
      },
      { $sort: { avgRating: -1 } }
    ];

    const results = await Movie.aggregate(aggregate).exec();
    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', error });
  }
});

router.get('/Reviews', authJwtController.isAuthenticated, async (req, res) => {
  try {
    const filter = req.query.movieId ? { movieId: req.query.movieId } : {};
    const reviews = await Review.find(filter);
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/Reviews', authJwtController.isAuthenticated, async (req, res) => {
  try {
    const { movieId, username, review, rating } = req.body;
    const newReview = new Review({ movieId, username, review, rating });
    await newReview.save();
    res.status(200).json({ message: 'Review created!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.use('/', router);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
