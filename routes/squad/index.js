const { SquadActivity } = require('../../models/SquadActivity');

const getSquad = (req, res) => {
  SquadActivity.findAll({ ...req.pagination }).then(result => {
    res.status(200).send(result);
  }).catch(err => {
    res.status(500).send(err);
  });
};

module.exports = { getSquad };
