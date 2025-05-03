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

var app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

var router = express.Router();



// API Route: Register
router.post('/signup', function(req, res) {
    if (!req.body.username || !req.body.password) {
        res.json({success: false, msg: 'Please include both username and password to signup.'});
    } else {
        var user = new User();
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

            res.json({success: true, msg: 'Successfully created new user.'});
        });
    }
});

// API Route: SignIn
router.post('/signin', function (req, res) {
    var userNew = new User();
    userNew.username = req.body.username;
    userNew.password = req.body.password;

    User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
        if (err) {
            res.send(err);
        }

        user.comparePassword(userNew.password, function(isMatch) {
            if (isMatch) {
                var userToken = { id: user.id, username: user.username };
                var token = jwt.sign(userToken, process.env.SECRET_KEY);
                res.json ({success: true, token: 'JWT ' + token});
            }
            else {
                res.status(401).send({success: false, msg: 'Authentication failed.'});
            }
        })
    })
});

// API Route: Movies (GET, POST, PUT, DELETE)
router.route('/movies')
.get(authJwtController.isAuthenticated, async (req, res) => {
  try {
      if (Object.keys(req.query).length === 0) {
          const aggregate = [
              { $lookup: { from: 'reviews', localField: '_id', foreignField: 'movieId', as: 'movieReviews' } },
              { $addFields: { avgRating: { $avg: '$movieReviews.rating' } } },
              { $sort: { avgRating: -1 } } // Sort by average rating in descending order
          ];
          const movies = await Movie.aggregate(aggregate);
          return res.status(200).json(movies);
      } else {
          const movies = await Movie.find(req.query);
          if (movies.length === 0) {
              return res.status(404).json({ message: 'No matching movies found' });
          }
          return res.status(200).json(movies);
      }
  } catch (error) {
      return res.status(500).json({ message: 'Internal Server Error', error });
  }
})
.post(authJwtController.isAuthenticated, async (req, res) => {
    try {
        if (Object.keys(req.query).length > 0) {
            return res.status(400).json({ message: 'Query parameters are not allowed in POST request' });
        }

        const { title, releaseDate, genre, actors, imageUrl } = req.body;

        if (!title || !releaseDate || !genre || !actors || actors.length < 3) {
            return res.status(400).json({ message: 'Title, release date, genre, and at least 3 actors are required' });
        }

        const newMovie = new Movie({
            title,
            releaseDate,
            genre,
            actors,
            imageUrl
        });

        await newMovie.save();
        return res.status(200).json({ message: 'Movie saved successfully', movie: newMovie });
    } catch (error) {
        return res.status(500).json({ message: 'Internal Server Error', error });
    }
})
.put(authJwtController.isAuthenticated, async (req, res) => {
    try {
        if (!req.query.title) {
            return res.status(400).json({ message: "Query string (title) is required for updating a movie." });
        }
        const { title } = req.query;
        const updateData = req.body;
        const updatedMovie = await Movie.findOneAndUpdate(
            { title },
            updateData,
            { new: true } 
        );
        if (!updatedMovie) {
            return res.status(404).json({ message: "Movie not found." });
        }
        res.status(200).json({ message: "Movie updated successfully.", movie: updatedMovie });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error });
    }
})
.delete(authJwtController.isAuthenticated, async (req, res) => {
    try {
        if (!req.query.title) {
            return res.status(400).json({ message: "Query string (title) is required for deleting a movie." });
        }
        const { title } = req.query;
        const deletedMovie = await Movie.findOneAndDelete({ title });
        if (!deletedMovie) {
            return res.status(404).json({ message: "Movie not found." });
        }
        res.status(200).json({ message: "Movie deleted successfully." });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error });
    }
});

// API Route: Movie Detail (with aggregated rating)
router.get('/movies/:id', authJwtController.isAuthenticated, async (req, res) => {
    const movieId = req.params.id;
    const aggregate = [
        { $match: { _id: mongoose.Types.ObjectId(movieId) } },
        { $lookup: { from: 'reviews', localField: '_id', foreignField: 'movieId', as: 'movieReviews' } },
        { $addFields: { avgRating: { $avg: '$movieReviews.rating' } } }
    ];
    Movie.aggregate(aggregate).exec((err, movie) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!movie) return res.status(404).json({ message: 'Movie not found' });
        res.status(200).json(movie[0]);
    });
});

// API Route: Reviews (GET, POST)
router.route('/Reviews')
.get(async (req, res) => {
    try {
        const filter = req.query.movieId ? { movieId: req.query.movieId } : {};
        const reviews = await Review.find(filter);
        res.json(reviews);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}) 
.post(authJwtController.isAuthenticated, async (req, res) => {
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

const PORT = process.env.PORT || 8080; // Define PORT before using it
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app; // for testing only
