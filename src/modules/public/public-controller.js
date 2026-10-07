const animalService = require('../animals/animal-service');
const adoptionRequestService = require('../adoptions/adoption-request-service');
const adoptionStepService = require('../content/adoption-step-service');
const dashboardService = require('../dashboard/dashboard-service');
const storyService = require('../stories/story-service');
const volunteerService = require('../volunteers/volunteer-service');
const { listResponse, successResponse } = require('../../utils/http-response');
const { parsePagination } = require('../../utils/pagination');

exports.listAnimals = async (req, res) => {
  const { items, total } = await animalService.listPublicPage(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

exports.getAnimal = async (req, res) => {
  return res.json(successResponse(await animalService.getPublicById(req.params.id)));
};

exports.listStories = async (req, res) => {
  const { items, total } = await storyService.listPublished(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

exports.listAdoptionSteps = async (req, res) => {
  return res.json(successResponse(await adoptionStepService.listActive()));
};

exports.createAdoptionRequest = async (req, res) => {
  return res.status(201).json(successResponse(await adoptionRequestService.create(req.body)));
};

exports.applyAsVolunteer = async (req, res) => {
  return res.status(201).json(successResponse(await volunteerService.apply(req.body)));
};

exports.getStats = async (req, res) => {
  return res.json(successResponse(await dashboardService.publicStats()));
};
